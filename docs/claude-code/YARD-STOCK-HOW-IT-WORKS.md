# Yard stock: how it works now (4 Nov 2026)

This describes the new app as it stands, and matches the old one. The questions at the end are for us to go through.

## The idea in one line
The yard is one stock list for the whole company. Stock comes **in**, goes **out to a job**, and comes **back**. Finance holds the rate (the £ value), and nobody else sees it.

## The four movements
Every movement is saved as a line, so there's a full history, and the database keeps the count right by itself.

| Movement | What it does to the count | What it does to money |
|---|---|---|
| **Book in** (a delivery, or leftovers) | Adds | Nothing |
| **Issue to a job** | Takes away | Puts a cost on that job: qty × yard rate ("Yard stock: …") |
| **Return from a job** | Adds | Takes that cost back off the job (a minus line, "Returned to yard: …") |
| **Adjust the count** (stock take) | Sets it to what's really there | Nothing |

- A cost only goes on the job if Finance has set a rate for that item. Without a rate, the count still moves but no money does.
- An issue can be bigger than the count shows. It asks first, and the count can go below zero until someone adjusts it.

## Where it sits

### Projects (PMs and admins)
In a job › **Materials**, there are five tabs: Material Requests, Collections, Completed, **Yard Stock**, **Book into yard**.
- **Yard Stock** shows the yard list without rates. Use it to:
  - **issue** stock to this job;
  - **return** stock from this job, with an optional note;
  - add a new item (name and unit, no rate).
- **From a material request:** the **Yard Stock** button on a request fills that request from the yard. The request closes as "Yard stock", with a note of what was taken.
- **Book into yard** is the book-in form: item, qty, who it came from, the PO or delivery note number, and a photo of the note.

### Drivers
- On the home screen, **Book Stock Into The Yard** opens the same form. It's for deliveries to the yard and leftovers they bring back.
- Drivers can't see rates, and can't issue or adjust.

### Finance
**Purchases › Yard stock** has:
- the full list with **rates** and the **stock value**, and a low stock count;
- add or edit items and their rate;
- book in, issue, return and adjust;
- **Book stock in**: the same form, but Finance can also pick the **PO** it came on. That links the booking to the PO.

## Leftover material, as it stands
There are two ways to bring leftovers back, and they behave differently:
1. **Return from the job** (job › Materials › Yard Stock › Return). The count goes up **and the job gets the cost back** at the yard rate.
2. **Book into yard** (the driver form, or the Book into yard tab). The count goes up, but **no job is credited**. It's treated like a new delivery.

So a driver bringing leftovers back from a job gives the job no credit. Only a PM's or Finance's "Return" does.

## Questions for us to go through
1. **Leftovers from drivers:** should the book-in form ask "Leftovers from a job? Which job?" and then credit that job, like a Return?
2. **Rates:** a yard item's rate is typed in by Finance. Should it update itself from the PO or invoice price when stock is booked in against a PO? It could use the latest price, or an average.
3. **Booking in against a PO:** should a booking in against a PO count as "received" on that PO's lines, as a delivery to site does?
4. **Who can issue:** PMs, admins and Finance can issue now. Should site managers be able to?
5. **Low stock:** should anyone be told when an item drops below a set level? This would come after the trial.
6. **Stock take:** should there be a "count everything" screen, a list with a box per item, instead of adjusting one item at a time?
