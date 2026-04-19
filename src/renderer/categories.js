// Auto-categorization rules: keyword → category
// Keywords are matched case-insensitively against the transaction description.

const RULES = [
  { category: "Groceries",      color: "#16a34a", keywords: ["walmart","kroger","safeway","aldi","trader joe","whole foods","publix","costco","sam's club","food lion","giant","wegman","sprouts","market","grocery","supermarket","stop & shop","heb","meijer","lidl"] },
  { category: "Dining",         color: "#f59e0b", keywords: ["restaurant","mcdonald","burger king","wendy","subway","taco bell","chipotle","domino","pizza","starbucks","dunkin","panera","chick-fil","kfc","popeye","five guys","olive garden","applebee","denny","ihop","café","cafe","sushi","doordash","grubhub","uber eats","instacart eats","postmates"] },
  { category: "Transport",      color: "#2563eb", keywords: ["uber","lyft","taxi","transit","metro","bus","train","amtrak","delta","united","american air","southwest","spirit","frontier","jetblue","parking","toll","eztoll","pike","sunpass","fastrak","gas","shell","bp","exxon","chevron","mobil","sunoco","arco","marathon","speedway","wawa","circle k","7-eleven fuel"] },
  { category: "Shopping",       color: "#7c3aed", keywords: ["amazon","ebay","etsy","target","best buy","home depot","lowe","ikea","wayfair","macy","nordstrom","kohls","tj maxx","marshalls","ross","gap","old navy","h&m","zara","forever 21","nike","adidas","apple store","microsoft store","newegg","chewy"] },
  { category: "Entertainment",  color: "#be185d", keywords: ["netflix","hulu","disney","hbo","spotify","apple music","youtube","twitch","steam","playstation","xbox","nintendo","amc","regal","cinemark","ticketmaster","eventbrite","concert","theater","museum"] },
  { category: "Health",         color: "#0d9488", keywords: ["pharmacy","cvs","walgreen","rite aid","doctor","dental","vision","hospital","clinic","optometry","urgent care","health","medical","prescription","lab corp","quest diag","insurance health","gym","planet fitness","anytime fitness","ymca","equinox","orange theory","crossfit"] },
  { category: "Utilities",      color: "#ea580c", keywords: ["electric","gas utility","water","sewage","internet","comcast","xfinity","spectrum","att","verizon","t-mobile","sprint","cox","dish","directv","hulu live","phone bill","utility","pg&e","comed","duke energy","national grid","con ed"] },
  { category: "Housing",        color: "#92400e", keywords: ["rent","mortgage","hoa","property tax","landlord","apartment","lease","maintenance","repair","plumber","electrician","hvac","roofing"] },
  { category: "Payroll",        color: "#15803d", keywords: ["payroll"] },
  { category: "Finance",        color: "#4f46e5", keywords: ["transfer","payment","interest","fee","overdraft","atm","withdrawal","deposit","investment","brokerage","fidelity","vanguard","schwab","robinhood","coinbase","paypal","venmo","zelle","cash app","western union","loan","credit card payment","mortgage payment"] },
  { category: "Travel",         color: "#0284c7", keywords: ["hotel","motel","airbnb","vrbo","marriott","hilton","hyatt","wyndham","booking.com","expedia","kayak","airfare","baggage","resort","cruise","excursion","tour","hostel"] },
  { category: "Education",      color: "#4d7c0f", keywords: ["tuition","university","college","school","udemy","coursera","skillshare","textbook","chegg","student loan","khan"] },
  { category: "Subscriptions",  color: "#c026d3", keywords: ["subscription","membership","monthly","annual fee","adobe","microsoft 365","office 365","dropbox","google one","icloud","zoom","slack","notion","canva","squarespace","wix","godaddy","cloudflare"] },
];

export const CATEGORIES = [...RULES.map((r) => r.category), "Other"];
export const CATEGORY_COLORS = Object.fromEntries(RULES.map((r) => [r.category, r.color]));
CATEGORY_COLORS["Other"] = "#9ca3af";

export function categorize(description) {
  const desc = (description || "").toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => desc.includes(k))) return rule.category;
  }
  return "Other";
}
