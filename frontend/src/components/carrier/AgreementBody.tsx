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
 * Agreement and the Caravan Quick Pay Agreement on the activation page -- so
 * the two cannot show different text. (Registration showed a click-through of
 * the BCA through here until 2026-09-28, when it was removed: the carrier
 * accepts the BCA once, at the portal signature.)
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
 *
 * v3.8.bma — the clauses are a list, so a screen reader announces them as one.
 * role="list" is explicit because Safari drops a list's role from the
 * accessibility tree when its list-style is none, so VoiceOver would not
 * announce it as a list without it. jsdom cannot show that; the test holds the
 * attribute instead. (The "comfortable" bulleted size existed for the
 * registration click-through and went with it.)
 */
export function AgreementBody({
  agreement,
  carrierName,
}: {
  agreement: AgreementBodyContent;
  carrierName?: string | null;
}) {
  const text = "text-[11px] text-gray-600 leading-relaxed";
  const heading = "text-xs font-bold text-[#0A2540] mb-0.5";
  const fill = (t: string) => fillCarrierParty(t, carrierName);

  return (
    <div data-testid="agreement-body">
      {agreement.preamble.map((p, i) => (
        <p key={`pre-${i}`} className={`${text} mb-2`}>{fill(p)}</p>
      ))}
      {agreement.sections.map((s) => (
        <div key={s.heading} className="mb-3 last:mb-0">
          <p className={heading}>{s.heading}</p>
          <ul role="list" className="list-none">
            {s.clauses.map((c, i) => (
              <li key={i} className={`${text} mb-1`}>{fill(c)}</li>
            ))}
          </ul>
          {s.table && (
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
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
