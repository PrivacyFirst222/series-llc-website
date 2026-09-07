/** The IRS online EIN assistant, walked screen by screen on 7 Sep 2026
 *  (sa.www4.irs.gov/applyein). The form asks what the assistant asks, in its
 *  words, so the office types straight down and never translates. */

export const EIN_REASONS = [
  "Started a new business",
  "Hired employee(s)",
  "Banking purposes",
  "Changed type of organization",
  "Purchased active business",
] as const;
export type EinReason = (typeof EIN_REASONS)[number];

export type EinFollowUp =
  | { kind: "choice"; question: string; options: readonly string[] }
  | { kind: "yesno"; question: string }
  | { kind: "text"; question: string }
  | { kind: "none" };

export interface EinCategory {
  name: string;
  description: string;
  followUp: EinFollowUp;
}

const choose = (options: readonly string[], question = "Please choose one of the following:"): EinFollowUp => ({ kind: "choice", question, options });
const PRIMARY = "Please choose one of the following that best describes your primary business activity:";

export const EIN_CATEGORIES: readonly EinCategory[] = [
  { name: "Accommodations", description: "Casino hotel, hotel, or motel", followUp: choose(["Casino hotel", "Hotel", "Motel", "Other"]) },
  { name: "Construction", description: "Building houses/residential structures, building industrial/commercial structures, specialty trade contractors, remodelers, heavy construction contractors, land subdivision contractors, or site preparation contractors", followUp: { kind: "yesno", question: "Do you focus on a single construction trade (concrete, framing, glass, roofing, siding, electrical, plumbing, HVAC, flooring, etc.)?" } },
  { name: "Finance", description: "Banks, sales financing, credit card issuing, mortgage company, mortgage company/broker, securities broker, investment advice, or trust administration", followUp: choose(["Commodities broker", "Credit card issuing", "Investment advice", "Investment club", "Investment holding", "Mortgage broker - agent for selling mortgages", "Mortgage company - lending funds with real estate as collateral", "Portfolio management", "Sales financing", "Securities broker", "Trust administration", "Venture capital company", "Other"], PRIMARY) },
  { name: "Food Service", description: "Retail fast food, restaurant, bar, coffee shop, catering, or mobile food service", followUp: choose(["Bar", "Bar and restaurant", "Catering service", "Coffee shop", "Fast food restaurant", "Full service restaurant", "Ice cream shop", "Mobile food service", "Other"], PRIMARY) },
  { name: "Health Care", description: "Doctor, mental health specialist, hospital, or outpatient care center", followUp: { kind: "yesno", question: "Does your establishment include medical practitioners having the degree of M.D. (Doctor of medicine) or D.O. (Doctor of osteopathy)?" } },
  { name: "Insurance", description: "Insurance company or broker", followUp: choose(["I am an insurance carrier.", "I am an insurance agent or broker.", "Other"], PRIMARY) },
  { name: "Manufacturing", description: "Mechanical, physical, or chemical transformation of materials/substances/components into new products, including the assembly of components", followUp: { kind: "text", question: "Please specify the type of goods that you manufacture and the primary materials used (such as \"wood furniture\"):" } },
  { name: "Real Estate", description: "Renting or leasing real estate, managing real estate, real estate agent/broker, selling, buying, or renting real estate for others", followUp: choose(["I rent or lease property that I own", "I use capital to build property", "I sell property for others", "I manage real estate for others", "Other"]) },
  { name: "Rental & Leasing", description: "Rent/lease automobiles, consumer goods, commercial goods, or industrial goods", followUp: choose(["I rent, lease, or sell real estate.", "I rent or lease goods.", "I manage real estate for others."]) },
  { name: "Retail", description: "Retail store, internet sales (exclusively), direct sales (catalogue, mail-order, door to door), auction house, or selling goods on auction sites", followUp: choose(["Selling goods exclusively over the Internet (including independently selling on auction sites).", "Sales from a storefront.", "Direct sales", "Auction house", "Other"]) },
  { name: "Social Assistance", description: "Youth services, residential care facility, services for the disabled, or community food/housing/relief services", followUp: choose(["Nursing home", "Shelter", "Youth services", "Other"], PRIMARY) },
  { name: "Transportation", description: "Air transportation, rail transportation, water transportation, trucking, passenger transportation, support activity for transportation, or delivery/courier service", followUp: choose(["Cargo", "Passengers", "I provide a support activity for transportation"], "Do you primarily transport cargo or passengers?") },
  { name: "Warehousing", description: "Operating warehousing or storage facilities for general merchandise, refrigerated goods, or other warehouse products; establishments that provide facilities to store goods but do not sell the goods they handle", followUp: { kind: "none" } },
  { name: "Wholesale", description: "Wholesale agent/broker, importer, exporter, manufacturers' representative, merchant, distributor, or jobber", followUp: { kind: "yesno", question: "Do you own or take title to the goods that you sell?" } },
  { name: "Other", description: "", followUp: choose(["Consulting", "Manufacturing", "Organization (such as religious, environmental, social or civic, athletic, etc.)", "Rental", "Repair", "Sell goods", "Service", "Other"], PRIMARY) },
];

export const EIN_CATEGORY_NAMES = EIN_CATEGORIES.map((c) => c.name) as [string, ...string[]];

export const einCategory = (name: string): EinCategory | undefined => EIN_CATEGORIES.find((c) => c.name === name);

/** Whether an answer satisfies the category's follow-up, as the assistant would require. */
export function followUpOk(category: string, answer: string): boolean {
  const c = einCategory(category);
  if (!c) return false;
  const a = answer.trim();
  switch (c.followUp.kind) {
    case "none": return true;
    case "yesno": return a === "Yes" || a === "No";
    case "text": return a.length >= 2;
    case "choice": return c.followUp.options.includes(a);
  }
}

/** The four special-activity questions, asked separately as the assistant asks them. */
/** Each question carries the assistant's own help box, shown as a hint so
 *  the client reads what the IRS means before answering (Adam, 7 Sep 2026). */
export const EIN_SPECIAL_QUESTIONS = [
  { key: "highwayVehicle", question: "Does your business own a highway motor vehicle with a taxable gross weight of 55,000 pounds or more?", help: "A highway motor vehicle is any self-propelled vehicle designed to carry a load over public highways — trucks, truck tractors, and buses, for example." },
  { key: "gambling", question: "Does your business involve gambling/wagering?", help: "Gambling or wagering means accepting wagers, conducting a wagering pool or lottery, or receiving wagers for or on behalf of another person." },
  { key: "form720", question: "Does your business need to file Form 720 (Quarterly Federal Excise Tax Return)?", help: "Form 720 is the quarterly federal excise tax return." },
  // No help box was walked for this question; it carries none rather than words the IRS did not say.
  { key: "alcoholTobaccoFirearms", question: "Does your business sell or manufacture alcohol, tobacco, or firearms?", help: "" },
] as const;

export const EIN_EMPLOYEE_HELP = {
  w2: "Employers must file Form W-2 for wages paid to each employee from whom income, Social Security, or Medicare tax was withheld, or from whom income tax would have been withheld had the employee claimed no more than one withholding allowance.",
  firstWageDate: "The date the entity began, or will begin, paying wages to its employees.",
  highest: "This information helps the IRS anticipate your employment tax obligations, but it doesn't represent a maximum employee limit. Total number of employees must be at least 1.",
  agricultural: "Agricultural employees include any person who works on a farm producing crops or raising livestock — stock, dairy, poultry, fruit, fur-bearing animal, and truck farms, orchards, ranches, nurseries, and greenhouses.",
  other: "A general rule is that anyone who performs services for you is your employee if you can control what work will be done and how it will be done. These employees will be issued a W-2 form at the end of the year.",
  form944: "For most employers, you are likely to pay $1,000 or less in employment taxes if you expect to pay $4,000 or less in total wages in a full calendar year.",
  form944Yes: "By selecting \"yes\", you are electing to file an annual employment tax return, Form 944.",
  form944No: "Select \"no\" if you prefer to file a quarterly return, Form 941.",
} as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type EinSpecialKey = (typeof EIN_SPECIAL_QUESTIONS)[number]["key"];
