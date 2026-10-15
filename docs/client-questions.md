# HashtagBillionaire: questions for you

We reviewed both halves of the platform: the **website** your customers use, and the **order system** behind it that prices orders, stores accounts and talks to suppliers and carriers. Along the way we found rules where the code does something specific, but we can't tell whether that's what the business wants. In a few places the website and the order system even disagree with each other.

We'd rather ask than guess. Your answers decide how we restructure both halves, so that each rule lives in one place and the website only displays what the order system decides.

**How to answer:** for each question, confirm what happens today or tell us what it should be. Short answers are fine. **High** priority items affect what customers are charged, what gets produced, or legal and contact details. Please answer those first.

**Before you start:** some everyday words, "design" above all, can mean different things to different people. The next section defines how we use them. Please read it first, and use the same words in your answers where you can.

---

## Words we use in this document

### Glossary

| Word | What we mean | Example |
|---|---|---|
| **Product** | One item in the catalog. | Gildan 5000 Heavy Cotton T-shirt |
| **Variant** | One size in one garment color of a product. Each variant has its own stock and price. | Gildan 5000, Navy, size M |
| **Garment color** | The color of the item itself. Not the color of the thread or ink. | A navy shirt |
| **Piece** | One physical item. | 30 shirts = 30 pieces |
| **Cart line** | One variant in the cart, with its quantity and decoration. Adding one logo to 3 sizes in one step creates 3 cart lines. | "10 × Navy M, Acme logo embroidered on the left chest" |
| **Order** | Everything a customer pays for in one checkout. | 3 cart lines paid together = 1 order |
| **Decoration method** (or **method**) | How artwork is put on the item. | Embroidery, DTF, screen print, DTG, laser engraving, color imprint |
| **Location** | Where on the item the artwork goes. | Left chest, full back, left sleeve, hat front |
| **Artwork** | The file the customer uploads, usually a logo. | acme-logo.png |
| **Custom text** | Words the customer types on the website, with a font and color. | "Team Acme 2026" in Oswald, white |
| **Thread / ink color** | The color(s) the artwork is produced in. Not the garment color. | White thread on a navy shirt |
| **Decoration** | One artwork (or custom text) at one location with one method. A logo on the chest and the same logo on the back are two decorations. | "Acme logo embroidered on the left chest" |
| **Decoration price** | The price per piece for one decoration, from the price tables. It comes on top of the garment price. | Left-chest embroidery, 24–35 pieces: $10 per piece |
| **Price tier** | A quantity range with its own price per piece. More pieces, lower price. | Embroidery: 1–11 pieces $12 each, 24–35 pieces $10 each |
| **Color count** | Screen print only: the number of ink colors in the artwork. Each color needs its own screen. | A red-and-black logo = 2 colors |
| **Setup fee** | A one-time charge to prepare production. Charged once, not per piece. | Making the screens for a screen print |
| **Digitizing fee** | The embroidery setup fee: turning artwork into a stitch file the machine can sew. | $35 |
| **Minimum order quantity** | The fewest pieces that can be ordered. | Screen print: at least 12 pieces |
| **Preview** (mockup) | The picture on screen showing artwork on an item. For the customer only; not a production file. | Logo drawn on a grey T-shirt |
| **Apparel** | Clothing and hats from the suppliers S&S, SanMar and OttoCap. | T-shirts, hoodies, polos, caps |
| **Promo product** | Branded merchandise from the supplier network SAGE. | Pens, tote bags, tumblers |
| **Pre-made product** | A product your team sets up in the admin panel, with its own options and prices. The system calls these "manual products". | A ready-made branded hoodie |
| **Option** | A choice your team defines on a pre-made product. | Size, gift wrap |
| **Add-on** | A separate product sold together with another. | A gift box with a hoodie |
| **Supplier cost** | What you pay the supplier for the blank item. | $6.00 for the shirt |
| **Markup** | The percentage added to the supplier cost to make the selling price. | $6.00 + 66.67% = $10.00 |
| **Website** / **admin panel** / **order system** | The store customers use / the screens your team uses / the server behind both, which prices orders and talks to suppliers and carriers. | |
| **Design** | Can mean several different things. See the next table. We avoid this word in the questions; where we use it, we say which meaning. | |

### What does "design" mean?

You told us the digitizing fee is "per design". Depending on what "design" means, the same order can contain one design or several, and the fee changes with it.

**Example order:**
- 30 navy shirts (10 S, 10 M, 10 L) and 20 white shirts (10 M, 10 L).
- Every shirt has the Acme logo embroidered on the left chest: white thread on the navy shirts, black thread on the white shirts.
- The navy shirts also have the same Acme logo, larger, on the full back.

| Meaning | One "design" is… | Designs in the example | Digitizing fees charged |
|---|---|---|---|
| **A. Per artwork** | One artwork file, whatever its size, location or thread colors. | 1: the Acme logo | 1 × $35 |
| **B. Per artwork, location and size** | One artwork at one location and size. | 2: small logo on the chest, large logo on the back | 2 × $35 |
| **C. Per artwork, location, size and thread/ink colors** | As B, and each color version counts separately. | 3: chest in white thread, chest in black thread, back in white thread | 3 × $35 |
| **D. Per finished look** | Everything decorated on one piece, taken together. Pieces that end up looking different are different designs. | 2: navy shirt (chest + back), white shirt (chest only) | 2 × $35 |
| **Today: per cart line** | What the system does now: every cart line on its own. | 5 lines (navy S, M, L; white M, L) | Up to 5 × $35, on lines of 11 pieces or fewer |

*For reference: in embroidery, a change of thread color usually doesn't need new digitizing, but a change of size usually does.*

Question 1 asks which meaning you intended, and whether the same meaning should apply to price tiers and minimums.

---

## Already decided

- **Digitizing fee is per design.** You confirmed the $35 embroidery digitizing fee applies per design when the quantity is small. "Design" can mean several things (see "What does 'design' mean?" above), so questions 1 and 2 ask which meaning you intended.
- **Email verification by link.** New customers get an email with a verification link instead of a code. Accounts not verified within 2 hours are deleted automatically. Question 40 has the details still open.
- **Forgot password by link.** The customer enters their email and receives a link. The page it opens lets them enter and confirm a new password.

---

## Summary

| # | Topic | Priority |
|---|---|---|
| | **Prices and fees** | |
| 1 | Which meaning of "design" applies to the digitizing fee, price tiers and minimums | High |
| 2 | Digitizing fee when one piece is embroidered at several locations | High |
| 3 | Setup fees for screen print, DTF and DTG | High |
| 4 | Decoration price tables: correct values, and who changes them | High |
| 5 | Hoodie "Full Front" and "Full Back" embroidery is free | High |
| 6 | "Full Front" on T-shirts and polos is switched off | Medium |
| 7 | Which print methods are allowed on which products | Medium |
| 8 | DTG with more than one location | High |
| 9 | Screen print: color count per location, and more than 6 colors | Medium |
| 10 | Decoration choices that aren't in the price list are free | High |
| 11 | Markup on supplier products | High |
| 12 | Supplier setup fee shown but never charged | High |
| 13 | Adding artwork to promo products is free | High |
| 14 | Drinkware: second-location fee and print types | Medium |
| 15 | $35 "Handling charge" on one supplier's tumblers | Medium |
| 16 | Minimum order quantities | Medium |
| 17 | How print products (cards, labels, banners) are ordered | Medium |
| 18 | What shoppers can see about your costs and markup | High |
| | **Artwork and production** | |
| 19 | What your production team receives | High |
| 20 | The same artwork at every location? | High |
| 21 | Accepted artwork file types and sizes | High |
| 22 | Generic mockups instead of the real product | Low |
| 23 | Fonts offered for custom text | Low |
| | **Product options** | |
| 24 | Options that must be chosen (e.g. size) | High |
| 25 | Add-on quantity | Medium |
| 26 | Pre-made products from other suppliers | Low |
| | **Shipping, tax and checkout** | |
| 27 | When the shipping label is bought | High |
| 28 | Who pays when the real label costs more or less than the quote | High |
| 29 | Sales tax | High |
| 30 | Ship-from name and address | High |
| 31 | Default package weight | Medium |
| 32 | Which states and territories you ship to | Medium |
| 33 | Guest checkout | Medium |
| 34 | Order cancellation and refunds | High |
| 35 | Unpaid orders | Medium |
| 36 | Changing quantities of customized items in the cart | High |
| 37 | Payment methods | Low |
| 38 | After payment: confirmation page and emails | Medium |
| 39 | Order tracking without an account | Low |
| | **Accounts and admin** | |
| 40 | Deleting unverified accounts | Medium |
| 41 | How long emailed links stay valid | Low |
| 42 | Password rules | Medium |
| 43 | Phone number at sign-up | Low |
| 44 | What each admin role may do | High |
| 45 | Accounts created by an admin | Low |
| 46 | Customers closing their own account | Low |
| 47 | Guest vs. signed-in product prices | Low |
| | **Stock and catalog** | |
| 48 | Supplier products with zero stock | High |
| 49 | "Only N left" message | Low |
| 50 | Category for imported OttoCap products | Low |
| 51 | Monthly supplier update schedule | Low |
| 52 | AI color matching | Low |
| 53 | "All Products" opens on an industry picker | Low |
| 54 | Price filter stops at $500 | Low |
| 55 | "Primary / Secondary / Budget" filter | Low |
| 56 | Gallery photos and captions | Low |
| 57 | Back button on the first page goes to Home | Low |
| | **Contact, email and legal** | |
| 58 | Contact email addresses | High |
| 59 | Look and wording of account emails | Low |
| 60 | Spam protection on public forms | Low |
| 61 | Legal and policy pages | Medium |
| | **Information we need** | |
| 62 | Checklist of details only you can provide | High |

---

## Prices and fees

### 1. Which meaning of "design" applies to the digitizing fee, price tiers and minimums (High)

**Today:** when a customer puts the same artwork on several sizes or garment colors in one step, each cart line is priced on its own. Each cart line of 11 pieces or fewer pays the $35 digitizing fee, and its price tier comes from that line's quantity alone. The website and the order system both do this.

*Example: the Acme logo embroidered on the left chest of navy shirts, 10 each in S, M and L (decoration price only, garment excluded):*
- Priced per cart line, as today: 3 × (10 × $12 + $35) = **$465**
- Priced as one group of 30 pieces: 30 × $10, no fee = **$300**

**Questions:**
- (a) For the digitizing fee, which meaning of "design" did you intend: A, B, C or D in the table "What does 'design' mean?"?
- (b) Should the price tier use the total pieces of that design across all its cart lines (30 pieces → the 24–35 tier)? If so, with the same meaning as in (a)?
- (c) Should minimums (for example screen print's 12 pieces, question 16) also count all pieces of the design across cart lines?
- (d) If a customer adds the same artwork in two separate steps (say navy shirts today, white shirts tomorrow, before checking out), does it still count as the same design?

### 2. Digitizing fee when one piece is embroidered at several locations (High)

**Today:** $35 once per cart line, however many locations are embroidered. A shirt with a logo on the left chest and a different logo on the full back (two artworks to digitize) still pays $35 once.

**Question:** Should the fee be charged per artwork, per artwork and location, or once per cart line however many locations there are? (This follows from your answer to question 1.)

### 3. Setup fees for screen print, DTF and DTG (High)

**Today:** only embroidery has a setup fee ($35, waived from 12 pieces). Screen print, DTF and DTG have none. Screen printing usually has a per-color or per-screen setup charge.

**Questions:** Is "$35, waived from 12 pieces" right for embroidery? Should screen print, DTF or DTG have setup fees, and how much (per color? per location?)?

### 4. Decoration price tables: correct values, and who changes them (High)

**Today:** these prices are written into the code, with one copy in the website and another in the order system. Changing a price needs a developer and a new release.
- **Embroidery** (per location, 7 quantity tiers from 1–11 to 144+):
  - Left or right chest, sleeve: $12 → $6.
  - Full back standard: $18 → $10.
  - Full back large: $22 → $12.
  - Hat front: $15 → $8.
  - Hat side and hat back arch: $10 → $5.
  - Oversized back: "request a quote".
- **DTF** (per location): $15 → $5.
- **Screen print** (per location, from 12 pieces, 6 tiers): 1 color $11.19 → $1.87, up to 6 colors $82.09 → $7.61.
- **DTG** (by style, 4 tiers):
  - Front: $15 → $9.
  - Oversized: $20 → $14.
  - Front & back: $30 → $18.
  - Front & back oversized: $40 → $28.

**Questions:**
- Are these numbers current?
- How often do they change?
- Should your team be able to edit them in the admin panel? We recommend that: one price list, kept by the order system and shown by the website.

### 5. Hoodie "Full Front" and "Full Back" embroidery is free (High)

**Today:** hoodies offer "Full Front" and "Full Back" locations. There's no embroidery price for either, so they add $0. DTF and screen print do charge for them.

**Question:** Should hoodies offer full front and full back embroidery? At what price, for example the same as T-shirt "Full Back (Standard)" or "(Large)"?

### 6. "Full Front" on T-shirts and polos is switched off (Medium)

**Today:** the option exists but is hidden. Its old embroidery price was $18 → $10.

**Question:** Should T-shirts and polos offer a full-front print? With which methods, and at what price?

### 7. Which print methods are allowed on which products (Medium)

**Today:** every apparel product offers all four methods: embroidery, DTF, screen print and DTG. That includes hats and polos, although DTG is described as "for 100% cotton tees".

**Question:** Which methods (and locations) are available for each product type: tees, hoodies, polos, hats, jackets, bags, and so on? For example, are hats embroidery only?

### 8. DTG with more than one location (High)

**Today:** the website shows DTG priced by style only (Front, Oversized, Front & Back…), but the customer can still pick several locations. **The order system charges the style price once per location chosen**, so the price in the cart can be higher than the price shown on the product page.

**Questions:** How should DTG be priced when several locations are chosen? Should DTG only allow the locations that match the chosen style?

### 9. Screen print: color count per location, and more than 6 colors (Medium)

**Today:** the customer picks one number of colors (1–6) and every location is charged at that count. A count above 6 isn't in the price list and is charged $0.

**Questions:** Can different locations have different color counts (e.g. 1-color sleeve, 4-color back)? What should happen above 6 colors: not allowed, or a quote?

### 10. Decoration choices that aren't in the price list are free (High)

**Today:** if a location, color count or print style isn't recognized exactly, it's priced at $0 instead of being refused. For example, "Left Chest" is $0 while "left-chest" is $10.

**Question:** May we only accept choices from a fixed list, and refuse anything else? We recommend it, together with question 4.

### 11. Markup on supplier products (High)

**Today:** supplier products are sold at cost plus a markup that your team can set per supplier in the admin panel.
- Where no markup is set, 66.67% is used.
- For SAGE promo products the website adds its own +49.25% when showing prices, and the price breakdown says 49.25%. The order system charges whatever SAGE markup is set in the admin, or 66.67% if none, so the shown price and the charged price can differ.

**Questions:**
- What markup should apply to each supplier?
- Should the admin setting be the only place it's defined? We recommend yes.

### 12. Supplier setup fee shown but never charged (High)

**Today:** when a supplier product has a setup fee, the quantity-pricing panel includes it, but the order summary and the order itself leave it out. The customer sees two totals and is charged the lower one.

**Question:** Should the supplier's setup fee be charged to the customer? With the markup or without?

### 13. Adding artwork to promo products is free (High)

**Today:** customers can add their artwork (usually a logo) to promo products (pens, bags, drinkware…) at no extra charge. The only exception is drinkware's second location (question 14).

**Question:** Is printing the artwork included in the promo price? Are there charges for full color, extra locations or extra ink colors?

### 14. Drinkware: second-location fee and print types (Medium)

**Today:** drinkware offers "Color imprint" or "Laser engraving" at the same price, on front and/or back. The first location is free; the second adds $8 per piece. That $8 is currently missing when the item is first added to the cart, and only appears after the quantity is changed.

**Questions:** Is $8 per piece right? Should laser engraving be priced differently?

### 15. $35 "Handling charge" on one supplier's tumblers (Medium)

**Today:** a $35 "Handling Charges" fee is added to tumblers from one SAGE supplier (supplier number 51093), once per cart line. Like question 14, it's missing when the tumblers are first added to the cart and appears after a quantity change, so the price jumps.

**Questions:** Is this fee correct? Should it be charged once per order, once per cart line, or per piece? Should it apply to other suppliers or categories?

### 16. Minimum order quantities (Medium)

**Today:**
- Promo products use the supplier's lowest price tier as the minimum. When the supplier gives none, the website assumes 100.
- Screen print requires 12 pieces per size (6 S + 6 M is refused).
- Other products use a minimum set on the product.

**Questions:**
- Is 100 the right fallback, or should products without a minimum allow any quantity?
- Should the screen-print minimum of 12 count all pieces with the same artwork at the same location, across sizes and garment colors, instead of each cart line? (See question 1 (c).)

### 17. How print products (cards, labels, banners) are ordered (Medium)

**Today:** business cards, labels and stickers, marketing materials, stationery, and signs and banners all go through the "add your logo" promo flow. Customers get no choice of paper, size or finish, and can't upload a print-ready file.

**Question:** How should customers order these? Upload a finished print-ready file? Choose from options your team sets up in the admin panel? Both?

### 18. What shoppers can see about your costs and markup (High)

**Today:** the product information sent to the website includes the supplier's cost price, your markup percentage, and for SAGE the distributor cost tiers. Shoppers can't see these on the page, but anyone can read them with the browser's developer tools.

**Question:** Should these be hidden from shoppers? We recommend sending shoppers only the selling prices.

---

## Artwork and production

### 19. What your production team receives (High)

**Today:** for customized apparel and promo items, the only file saved with the order is a **500 × 500 pixel picture of the on-screen preview**: the artwork drawn on a generic grey garment. Not saved:
- the customer's original artwork file
- its size and position
- any custom text, font, color or rotation

**Question:** What does production need for each method? For example: the original file (vector for embroidery?), placement and size in inches, and the text and font as text.

### 20. The same artwork at every location? (High)

**Today:** the customizer takes one artwork. The customer can choose several locations (e.g. left chest and full back), but there's only one artwork, and nothing records which artwork goes where or at what size.

**Questions:**
- Is it always the same artwork at every chosen location, or can each location have its own (e.g. logo on the chest, a slogan on the back)?
- If it's the same artwork, can its size and thread/ink colors differ per location?

(This also affects questions 1 and 2.)

### 21. Accepted artwork file types and sizes (High)

**Today:**
- The customizer accepts ordinary images (PNG, JPG…).
- Products set up in the admin with customization options accept only SVG or Adobe Illustrator (.ai) files. A customer who only has a PNG logo can't upload it.
- The website says 10 MB in one place and 5 MB in another; after our security update the order system accepts up to 20 MB per file.

**Questions:**
- Which file types should be accepted for each method? Is PNG/JPG fine for DTF and DTG?
- Does embroidery need vector files?
- What maximum size?

### 22. Generic mockups instead of the real product (Low)

**Today:** artwork is previewed on generic grey garments (tee, hoodie, polo or hat), guessed from the category name. Jackets and bags fall back to the tee, and the real product photo isn't used.

**Question:** Is a generic preview acceptable, or should customers see their artwork on the real product, in the garment color they chose?

### 23. Fonts offered for custom text (Low)

**Today:** six fonts: Georgia, Montserrat, Dancing Script, Oswald, Courier New and Impact.

**Question:** Can production reproduce these, especially in embroidery? Should the list change?

---

## Product options

### 24. Options that must be chosen (High)

**Today:** on products set up in the admin with options, every option is optional, so a pre-made hoodie can be added to the cart with no size chosen. The order system doesn't require any option either.

**Question:** Which options must always be chosen (size?), and should your team be able to mark an option "required" in the admin?

### 25. Add-on quantity (Medium)

**Today:** the website sets the add-on quantity equal to the product quantity (50 hoodies → 50 add-ons). The order system already supports a different add-on quantity.

**Question:** Is "same as the product" always right, or are some add-ons one per order (e.g. a single gift box)? Should the customer choose?

### 26. Pre-made products from other suppliers (Low)

**Today:** all pre-made products (hoodies, tees) are set up in the admin. The website has a second ordering screen for pre-made products from suppliers, but it never appears.

**Question:** Will you sell pre-made products from suppliers? If not, we'll remove the unused screen.

---

## Shipping, tax and checkout

### 27. When the shipping label is bought (High)

**Today:** when the customer clicks "Continue to payment", a shipment is created with the carrier and a real, paid shipping label is bought, before the customer pays. If they abandon checkout, the label has already been paid for, and it's only cancelled if they later change their cart. Custom items can take days to produce, so the label is bought long before the package ships.

**Question:** When should the label be bought: after payment, or when the order is ready to ship? (We recommend when it's ready to ship, bought by your team.)

### 28. Who pays when the real label costs more or less than the quote (High)

**Today:** the customer picks a shipping rate. When the label is bought, the carrier's actual price replaces it in the order total, so the amount charged can differ from what the customer chose.

**Question:** Should the customer always pay the quoted price, with you absorbing or keeping the difference?

### 29. Sales tax (High)

**Today:** tax is a flat 8.25% for every order and every destination, applied to products only, not shipping. Nobody is tax-exempt.

**Questions:**
- In which states do you collect sales tax?
- Should tax depend on the delivery address? (If so, a tax service is usually the simplest route.)
- Should shipping be taxed?
- Are any customers tax-exempt, such as resellers or nonprofits?

### 30. Ship-from name and address (High)

**Today:** every label shows an individual's name, phone number and home address in Katy, TX as the sender.

**Question:** Is this the right sender for all orders, or should it be a business name and address? Do some suppliers ship directly to the customer?

### 31. Default package weight (Medium)

**Today:** products without a weight are shipped as 0.5 lb each, which affects label cost and accuracy.

**Question:** Is 0.5 lb acceptable, or can you provide weights per product type?

### 32. Which states and territories you ship to (Medium)

**Today:** US only. The state list includes uninhabited islands (Baker Island, Howland Island, Jarvis Island, Johnston Atoll, Kingman Reef, Midway Atoll, Wake Island) and territories such as Guam and American Samoa.

**Questions:** Which states and territories do you ship to? Military (APO/FPO) addresses? Anything outside the US?

### 33. Guest checkout (Medium)

**Today:** an account is required to add to cart, save items or check out.

**Question:** Should customers be able to buy without an account?

### 34. Order cancellation and refunds (High)

**Today:** the website has no cancel button. The order system has a cancel function, but it doesn't currently work, and it never refunds the customer; it only puts the stock back.

**Questions:**
- Can customers cancel themselves, and until which stage (before production starts?)?
- Should refunds be automatic, or approved by your team?
- What is your refund policy for custom-made items?

### 35. Unpaid orders (Medium)

**Today:** if a customer stops at the payment step, the order stays "unpaid" indefinitely. If they change their cart, it's discarded. The website may also pick the old unpaid order back up at their next checkout.

**Questions:** How long should unpaid orders be kept? Should they cancel automatically, and should the customer be reminded?

### 36. Changing quantities of customized items in the cart (High)

**Today:** customers can change the quantity of any cart line, including customized ones. The order system recalculates the price, the tier and the digitizing fee. Some minimums aren't checked on a change, though. Going below a minimum with the "−" button removes the item entirely instead of stopping at the minimum.

**Questions:**
- Should customized items be editable in the cart, or only on the product page?
- Should "−" stop at the minimum?

### 37. Payment methods (Low)

**Today:** card, Google Pay and Cash App Pay (through Square), and PayPal.

**Question:** Are these the right methods? Do you want Apple Pay?

### 38. After payment: confirmation page and emails (Medium)

**Today:**
- After paying, the customer is sent to the products page after about 3 seconds. A confirmation page exists, but nothing links to it.
- **The system sends no order emails at all:** no order confirmation, no shipping notice, no cancellation notice.

**Question:** Which emails should customers receive (order confirmation, shipped with tracking, cancelled/refunded)? Should your team be notified of new orders by email too?

### 39. Order tracking without an account (Low)

**Today:** only signed-in customers can see their orders and tracking.

**Question:** Should anyone be able to track an order with its order number and email? (Mainly needed if you add guest checkout, question 33.)

---

## Accounts and admin

### 40. Deleting unverified accounts (Medium)

**Decided:** accounts not verified within 2 hours are deleted.

**Questions:**
- As built, "deleted" means hidden and unusable, but the record stays in the database. Should it be erased completely?
- Customers who registered in the past and never verified will also be removed when this goes live. Is that fine, or should they get one fresh verification email first?

### 41. How long emailed links stay valid (Low)

**With our security update:**
- Password reset link: 60 minutes, single use.
- "Set your password" link for accounts created by your team: 72 hours.
- A new link can be requested at most once a minute.

**Question:** Are these durations right?

### 42. Password rules (Medium)

**Today:** the two halves disagree.
- The website asks for 8+ characters with an uppercase letter, a number and a special character.
- The order system requires 8+ characters with at least 2 digits and no spaces.

**Question:** Which rule do you want? We'll make both halves use it.

### 43. Phone number at sign-up (Low)

**Today:** sign-up requires a phone number. The website expects exactly 10 digits; the order system accepts anything. Addresses accept 7–20 digits.

**Question:** Is a phone number required at sign-up? US numbers only?

### 44. What each admin role may do (High)

**With our security update:**
- Any admin can manage products, prices and markup, categories, brands, supplier imports, customers, orders, contact messages and sourcing requests.
- Only a Super Admin can create, edit or delete admin accounts, and change roles and departments.
- A Super Admin can't delete themselves, can't be deleted, and new Super Admins can't be created from the admin panel.
- The roles "Admin", "Sub Admin", "Engineer" and "Editor" exist but all have the same access.

**Question:** Should any role be limited? For example: editors who can't change prices or markup, delete products, or see customer details.

### 45. Accounts created by your team (Low)

**With our security update:** when your team creates a customer or admin account, that person gets a "set your password" email. No password is generated or emailed. Customer accounts created this way count as verified.

**Question:** Is that the experience you want?

### 46. Customers closing their own account (Low)

**Today:** customers can deactivate their own account.

**Question:** Keep this? Should their order history be kept?

### 47. Guest vs. signed-in product prices (Low)

**Today:** guests and signed-in customers see the same prices, but they're calculated separately and could drift apart.

**Question:** Confirm guests and signed-in customers should always see identical prices (we'll calculate them in one place).

---

## Stock and catalog

### 48. Supplier products with zero stock (High)

**Today:** when SAGE reports a stock of 0, the system records 999,999 in stock, so those items can always be ordered.

**Question:** Is that intentional (for example, because promo items are made to order), or should zero stock stop orders?

### 49. "Only N left" message (Low)

**Today:** the product page shows "Only N left in stock" at 5 or fewer, while the order system flags low stock below 10.

**Question:** Should it show at all? At what level?

### 50. Category for imported OttoCap products (Low)

**Today:** every imported OttoCap product goes into one fixed category.

**Question:** Is one category right, or should they be categorized like other products?

### 51. Monthly supplier update schedule (Low)

**Today:** prices and stock are refreshed automatically once a month at 2 AM New York time: SAGE on the 5th, SanMar on the 10th, S&S on the 15th, OttoCap on the 25th.

**Question:** Is monthly often enough? Stock in particular can change daily.

### 52. AI color matching (Low)

**Today:** when a supplier's color name isn't recognized, an AI service (OpenAI, paid per use) picks the color swatch.

**Question:** Is this approved, including the cost?

### 53. "All Products" opens on an industry picker (Low)

**Today:** opening "All Products" without a filter first asks the customer to pick an industry or use case.

**Question:** Keep this, or go straight to the product grid?

### 54. Price filter stops at $500 (Low)

**Today:** the price slider is fixed at $0–$500.

**Question:** Are there, or will there be, products above $500?

### 55. "Primary / Secondary / Budget" filter (Low)

**Today:** after choosing a use case, customers can filter by "Primary", "Secondary" or "Budget". Your team assigns products to these in the admin.

**Question:** What should these mean to a customer? Are these the right labels?

### 56. Gallery photos and captions (Low)

**Today:** gallery photos are built into the website, captioned with file names such as "IMG_0357".

**Question:** Should your team manage gallery photos and captions from the admin?

### 57. Back button on the first page goes to Home (Low)

**Today:** when someone opens a page in a new tab (e.g. a product link) and presses Back, they go to the Home page.

**Question:** Is that intended?

---

## Contact, email and legal

### 58. Contact email addresses (High)

**Today:**
- The website shows four addresses:
  - **Footer (every page):** `patrick@hashtagbillioniare.net`. "Billionaire" is misspelled and the domain is `.net`, so mail sent there may be lost.
  - **Support page:** `support@hashtagbillionaire.com`
  - **Terms:** `legal@hashtagbillionaire.com`
  - **Privacy policy:** `privacy@hashtagbillionaire.com`
- Contact-form messages are emailed to one person's work inbox at another company (mypageseo.com).

**Questions:**
- Which addresses should customers see?
- Which address should receive contact-form messages and sourcing requests? A shared inbox is best.

### 59. Look and wording of account emails (Low)

**With our security update:** verification, password-reset and "set your password" emails use simple text with the "Hashtag Billionaire" name.

**Question:** Please review the wording and send your company logo, brand colors, a sender name and a support contact if you want them in the emails.

### 60. Spam protection on public forms (Low)

**With our security update:** the contact and sourcing-request forms accept up to 10 submissions per hour from one connection.

**Question:** Should we add a "I'm not a robot" check (CAPTCHA)?

### 61. Legal and policy pages (Medium)

**Today:** the privacy policy, terms, shipping & returns, and refund policy are fixed text inside the website.

**Questions:**
- Has this text been approved?
- What is the returns and refund policy for custom-made items?
- Should your team be able to edit these pages from the admin?

---

## 62. Information we need (High)

Please send:
- [ ] The live website address and admin panel address (used in the links in account emails and after PayPal payment).
- [ ] The business name, address and phone for shipping labels (question 30).
- [ ] The inbox for contact-form messages and sourcing requests (question 58).
- [ ] States where you're registered to collect sales tax (question 29).
- [ ] Product weights or weights per product type (question 31).
- [ ] Logo, brand colors and sender name for emails (question 59).
- [ ] Approved legal and policy text, including the refund policy for custom items (question 61).
