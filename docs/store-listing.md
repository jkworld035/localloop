# Google Play store listing (draft)

Copy these into Play Console → Grow → Store presence → Main store listing.
Add Telugu as a second listing language (Play Console → Translations → Add your
own translation → Telugu – te-IN). Have the Telugu reviewed with the rest of
the app text.

## App details
| Field | English | Telugu |
|---|---|---|
| App name (≤30) | LocalLoop: Shop Local | లోకల్‌లూప్: స్థానిక దుకాణాలు |
| Short description (≤80) | Order from shops in Kamareddy and track delivery live on the map. | కామారెడ్డిలోని దుకాణాల నుండి ఆర్డర్ చేసి, డెలివరీని మ్యాప్‌లో లైవ్‌గా చూడండి. |
| Category | Shopping | |
| Tags | Grocery, Delivery, Local business | |
| Email / phone / website | from `LEGAL_ENTITY` | |
| Privacy policy | https://admin.localloop.in/legal/privacy | |

## Full description — English (≤4000)
LocalLoop brings the shops around you to your phone. Order groceries, vegetables, bakery items and everyday essentials from real local shops in Kamareddy — and watch your delivery come to you on the map.

**For customers**
• See shops near you, sorted by distance, rating or delivery time
• Search for a product across every nearby shop
• Pay cash on delivery
• Track your delivery partner live, with an arrival time based on the actual road route
• A 4-digit delivery code keeps your order safe until it's in your hands
• Rate the shop, the products and the delivery
• Help & support inside the app, in English or Telugu

**For shop owners**
• List your shop and products with photos, sizes and prices — free to join
• Accept orders with one tap and set how long you need to prepare them
• Keep stock up to date and get alerts when items run low
• A delivery partner nearby is found for you automatically

**For delivery partners**
• Go online when you want to work
• See each request's shop distance, trip length and cash to collect before you accept
• Turn-by-turn navigation with Google Maps
• Track your earnings and deliveries

Made in Telangana, in English and తెలుగు.

## Full description — Telugu
లోకల్‌లూప్ మీ చుట్టూ ఉన్న దుకాణాలను మీ ఫోన్‌కు తెస్తుంది. కామారెడ్డిలోని నిజమైన స్థానిక దుకాణాల నుండి కిరాణా, కూరగాయలు, బేకరీ వస్తువులు, రోజువారీ అవసరాలు ఆర్డర్ చేయండి — మీ డెలివరీ మీ దగ్గరికి వస్తుండగా మ్యాప్‌లో చూడండి.

**కస్టమర్లకు**
• దగ్గరలోని దుకాణాలు — దూరం, రేటింగ్ లేదా డెలివరీ సమయం ప్రకారం
• దగ్గరలోని అన్ని దుకాణాల్లో ఒక వస్తువును వెతకండి
• డెలివరీ సమయంలో నగదు చెల్లించండి
• మీ డెలివరీ భాగస్వామిని లైవ్‌గా ట్రాక్ చేయండి — నిజమైన రోడ్డు మార్గం ఆధారంగా చేరే సమయం
• 4 అంకెల డెలివరీ కోడ్ మీ ఆర్డర్‌ను సురక్షితంగా ఉంచుతుంది
• దుకాణం, వస్తువులు, డెలివరీకి రేటింగ్ ఇవ్వండి
• యాప్‌లోనే సహాయం — తెలుగు లేదా ఆంగ్లంలో

**దుకాణదారులకు**
• మీ దుకాణం, వస్తువులను ఫోటోలు, సైజులు, ధరలతో జాబితా చేయండి — చేరడం ఉచితం
• ఒక్క ట్యాప్‌తో ఆర్డర్లు అంగీకరించండి
• స్టాక్ తక్కువైనప్పుడు హెచ్చరికలు
• దగ్గరలోని డెలివరీ భాగస్వామి ఆటోమేటిక్‌గా దొరుకుతారు

**డెలివరీ భాగస్వాములకు**
• మీకు కావలసినప్పుడు ఆన్‌లైన్‌కి వెళ్లండి
• అంగీకరించే ముందు దుకాణం దూరం, ప్రయాణ దూరం, తీసుకోవాల్సిన నగదు చూడండి
• Google Maps తో దారి
• మీ సంపాదన, డెలివరీలు ఒకే చోట

తెలంగాణలో తయారు — తెలుగు, ఆంగ్లంలో.

> Check before publishing: "free to join" must match your shop terms, and the product categories must match what shops actually sell.

## Graphics
| Asset | Spec | What to show |
|---|---|---|
| App icon | 512×512 PNG | `apps/mobile/assets/icon.png` exported at 512 |
| Feature graphic | 1024×500 | Brand green, logo, “Your local shops, delivered” |
| Phone screenshots | 4–8, 1080×1920+ | 1 Nearby shops · 2 Shop page · 3 Cart & checkout · 4 Live tracking map · 5 Order with delivery code · 6 Telugu home screen · 7 Shop owner orders · 8 Partner delivery request |

Take screenshots from a real phone with a real shop's consent (or the demo shop), never with real customers' names or numbers visible.

## Data safety form
Play Console → App content → Data safety. Based on what the code actually does:

| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Name | Yes | Yes (shop & partner for the order) | App functionality, Account management | No |
| Phone number | Yes | Yes (partner, for the active delivery) | Account management, App functionality | No |
| Email address | Yes | No | Account management | Yes |
| Address (delivery addresses) | Yes | Yes (shop area; full address to partner) | App functionality | No |
| Precise location | Yes | Yes (partner position → customer during delivery) | App functionality | No (customers can enter an address instead; required for partners) |
| Approximate location | Yes | No | App functionality | Yes |
| Purchase history (orders) | Yes | No | App functionality | No |
| Photos (products, shop, documents, profile) | Yes | No | App functionality | Yes |
| App interactions / crash logs | Yes (crash reports) | No | App functionality (diagnostics) | No |
| Device or other IDs (push token) | Yes | No | App functionality (notifications) | No |
| Messages (support chats) | Yes | No | Customer support | Yes |
| Financial info | **No** — card/UPI details are handled by the payment provider | | | |

Also answer: data is **encrypted in transit** — Yes. Users can **request deletion** — Yes (in-app, and https://admin.localloop.in/legal/delete-account). Shared data goes to the shop/partner fulfilling the user's own order; processors (Supabase, Google Maps, Expo push, the SMS provider) are service providers, which Play does not count as "sharing".

## Permissions declarations
**Background location (ACCESS_BACKGROUND_LOCATION)** — Play Console → App content → Sensitive permissions → Location permissions:
> Delivery partners share their location while online and during a delivery so that orders are offered to the nearest partner and customers can see their delivery approaching on a live map. Location is collected in the background only after the partner taps "Go online" and agrees to an in-app explanation; it stops when they go offline. Customers and shop owners are never asked for background location.

Video: show Partner → Go online → the explanation card → the Android permission prompt → an accepted delivery moving on the customer's tracking map.

**Foreground service (location)** — type: location; same justification.

**Camera / photos** — product, shop and verification-document photos.

## Content rating & audience
IARC questionnaire: shopping app, no violence/sexual content/gambling, users can communicate only with support staff (not each other), shares location with other users (the delivery partner's position during delivery). Target audience: 18+.
