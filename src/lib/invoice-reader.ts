import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

/** The model used to read invoices. Override with INVOICE_MODEL in Vercel if you want a cheaper one. */
const MODEL = process.env.INVOICE_MODEL || "claude-opus-5-5";

export const InvoiceSchema = z.object({
  supplier_name: z.string().describe("Supplier / vendor company name, in English if printed, otherwise as printed"),
  supplier_name_ar: z.string().nullable().describe("Supplier name in Arabic if printed"),
  supplier_trn: z.string().nullable().describe("UAE Tax Registration Number (TRN) of the supplier, digits only"),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable().describe("Invoice date as YYYY-MM-DD"),
  currency: z.string().describe("ISO currency code, normally AED"),
  subtotal: z.number().nullable().describe("Total before VAT"),
  vat: z.number().nullable().describe("VAT amount"),
  total: z.number().nullable().describe("Grand total including VAT"),
  lines: z.array(
    z.object({
      description: z.string().describe("Item description exactly as printed (Arabic or English)"),
      description_en: z.string().describe("Short clear English name of the product, e.g. 'Full fat milk 2L'"),
      quantity: z.number().nullable(),
      unit: z.string().nullable().describe("Unit as printed, e.g. CTN, KG, PCS, BTL, PKT"),
      unit_price: z.number().nullable().describe("Price for ONE invoice unit, EXCLUDING VAT"),
      line_total: z.number().nullable().describe("Line amount EXCLUDING VAT"),
      is_ingredient: z
        .boolean()
        .describe("false for delivery charges, deposits, discounts, rounding and other non-product lines"),
      base_unit: z.enum(["g", "ml", "pcs"]).describe("How this product is measured in recipes"),
      pack_size: z
        .number()
        .nullable()
        .describe(
          "How many base units are in ONE invoice unit. Examples: carton of 6 x 2L milk = 12000 (ml); 1 KG = 1000 (g); box of 12 x 500g = 6000 (g); tray of 30 eggs = 30 (pcs). If base_unit is pcs, count the pieces in one unit (a 400g pack of 6 buns = 6), never the weight. null if you cannot tell.",
        ),
      matched_item_id: z
        .string()
        .nullable()
        .describe("id from the known ingredient list if this line is clearly the same product, else null"),
    }),
  ),
  notes: z
    .string()
    .nullable()
    .describe("Anything the reviewer should double-check: blurry numbers, totals that don't add up, missing pages"),
});

export type ExtractedInvoice = z.infer<typeof InvoiceSchema>;

export type InvoiceFile = { data: Buffer; mimeType: string };
export type KnownItem = { id: string; name: string; name_ar: string | null; base_unit: string };

const SYSTEM = `You read supplier invoices for a cafe in Dubai, UAE. Invoices may be in Arabic, English or both, and are usually in AED with 5% VAT.
The photos may be several pages of the same invoice, in order. Extract every product line once (don't double count lines repeated on a summary page).
Prices must be EXCLUDING VAT. If the invoice only shows VAT-inclusive line prices, divide by 1.05 and say so in notes.
Read numbers carefully: Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) are ordinary digits; the Arabic decimal separator is ٫.
If something is unreadable, use null rather than guessing, and mention it in notes.`;

export async function readInvoice(files: InvoiceFile[], known: KnownItem[]): Promise<ExtractedInvoice> {
  const client = new Anthropic();

  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) =>
    f.mimeType === "application/pdf"
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: f.data.toString("base64") },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.mimeType)
              ? f.mimeType
              : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: f.data.toString("base64"),
          },
        },
  );

  const knownList = known.length
    ? known.map((k) => `${k.id} | ${k.name}${k.name_ar ? ` | ${k.name_ar}` : ""} | ${k.base_unit}`).join("\n")
    : "(none yet)";

  content.push({
    type: "text",
    text: `Today's date (Dubai): ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" })}.\n\nKnown ingredients (id | name | arabic name | unit):\n${knownList}\n\nExtract this invoice (${files.length} page(s)).`,
  });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(InvoiceSchema), effort: "medium" },
  });

  if (response.stop_reason === "refusal") throw new Error("The reader declined this file.");
  if (response.stop_reason === "max_tokens") throw new Error("Invoice too long to read in one go. Try fewer pages.");
  if (!response.parsed_output) throw new Error("Could not understand the reader's answer.");
  return response.parsed_output;
}
