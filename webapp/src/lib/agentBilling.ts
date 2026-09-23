/** Adam's approved policy, shared by intake, portal, office and emails. */
export const RA_NOTICE_DAYS = 70;
export const RA_MIN_NOTICE_DAYS = 60;
export const RA_CANCEL_DAYS = 30;
export const RA_CHARGE_DAYS = 15;
export const RA_RESIGNATION_CENTS = 9900;
export const RA_CANCELLATION = "You may give cancellation notice at any time. To stop the next annual renewal, give notice at least 30 days before your renewal date and provide proof by the renewal date that another registered agent has replaced us. If you give timely notice but do not provide that proof, we will submit our resignation on the renewal date and charge $99 for state filing fees and processing. This charge does not purchase another year of registered-agent service. We will email you a copy of the resignation and mail the notice required by Florida law. Our appointment ends when the resignation becomes effective under Florida law. Changing agents during a paid service year does not entitle you to a refund.";
export const RA_CARD_CONSENT = "I agree to automatic annual renewal and to keep my card on file with Square. The first year begins when our registered-agent appointment takes effect and is included in the service fee. From the second year, the $99 annual renewal is charged 15 days before the renewal date. I may give cancellation notice at any time; to stop the next renewal, I must give notice at least 30 days before renewal and provide replacement-agent proof by the renewal date. Timely cancellation without that proof results in a $99 resignation charge for state filing fees and processing instead of another service year. A successfully saved eligible card is required for this service.";
export const RA_PREPAID_ERROR = "We do not accept prepaid cards for packages that include our registered-agent service. Use a credit or non-prepaid debit card, or choose another registered agent.";
export function cardStatusWords(status: string | null | undefined, note?: string | null): string {
 if (status === "on_file") return "Card on file";
 if (status === "gift_card") return "No eligible card — prepaid card declined for this service";
 const reasons: Record<string,string> = {"wallet payment":"wallet payment cannot be saved",customer:"Square customer setup failed","not saveable":"Square could not save the card","no payment id":"payment reference is missing"};
 if(status === "none") return `No card on file${note ? ` — ${reasons[note] ?? "card could not be saved; retry card setup"}` : ""}`;
 return "Card status not recorded";
}
