import { fillCarrierParty } from "@shared/constants/agreementParty";

/** The agreement body as GET /carrier-auth/agreement/:type serves it. */
export interface AgreementBodyContent {
  preamble: string[];
  sections: {
    heading: string;
    clauses: string[];
    table?: { headers: string[]; rows: string[][] };
  }[];
}

/**
 * The words of an agreement, as a carrier reads them before signing.
 *
 * ONE renderer for every pane that shows an agreement -- the Broker-Carrier
 * Agreement and the Caravan Quick Pay Agreement on the activation page, and the
 * click-through at registration -- so the three cannot show different text.
 *
 * Two things the panes used to leave out, both of which the carrier signs:
 *
 *   The carrier's name. The opening paragraph names them through a placeholder
 *   that fillCarrierParty fills -- the same function the executed PDF and the
 *   hashed text use -- so the pane says what the signed document will say.
 *
 *   The tables. The accessorial figures in paragraph 24 and the tier terms in
 *   Schedule A are TABLES, and a pane that drew only clauses showed a carrier
 *   neither the detention rate nor their payment terms before they agreed to
 *   them.
 */
export function AgreementBody({
  agreement,
  carrierName,
  size = "compact",
}: {
  agreement: AgreementBodyContent;
  carrierName?: string | null;
  size?: "compact" | "comfortable";
}) {
  const compact = size === "compact";
  const text = compact ? "text-[11px] text-gray-600 leading-relaxed" : "leading-relaxed";
  const heading = compact ? "text-xs font-bold text-[#0A2540] mb-0.5" : "font-semibold text-[#0A2540] mt-3 mb-1";
  const fill = (t: string) => fillCarrierParty(t, carrierName);

  return (
    <div data-testid="agreement-body">
      {agreement.preamble.map((p, i) => (
        <p key={`pre-${i}`} className={`${text} mb-2`}>{fill(p)}</p>
      ))}
      {agreement.sections.map((s) => (
        <div key={s.heading} className={compact ? "mb-3 last:mb-0" : "mb-2"}>
          <p className={heading}>{s.heading}</p>
          {s.clauses.map((c, i) => (
            <p key={i} className={`${text} mb-1`}>{fill(c)}</p>
          ))}
          {s.table && (
            <div className="mt-1.5 overflow-x-auto">
              <table className={`w-full border-collapse ${compact ? "text-[11px]" : "text-sm"}`}>
                <thead>
                  <tr>
                    {s.table.headers.map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-[#0A2540]/30 px-2 py-1 text-left font-semibold text-[#0A2540] align-bottom"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-[#EFE6D3] last:border-b-0">
                      {r.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`px-2 py-1 align-top ${ci === 0 ? "font-medium text-[#0A2540]" : "text-gray-600"}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
