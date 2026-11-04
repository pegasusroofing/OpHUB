# Plant tracking: how it can work (plan, 4 Nov 2026)

**The problem:** gas cylinders, cages and the like go missing. We need to know, at any moment, **where every item is and who signed for it last**.

## What's already there (from the old app, rebuilt)
- **A company plant register** (`plant_items`). Each item has a photo, serial number and inspection due date, and sits at one job or the yard.
- **An operative can ask to take an item** with a pre-use checklist, and **hand it back** with a required photo.
- **Nothing changes hands until a PM signs it off** with their saved signature.
- **Moving an item** from another job ("Bring Here") is logged.
- **LOLER inspections** move the inspection dates on.

What's missing is the **two-way signing**, an **office view** of everything, **counting identical items** like gas cylinders, and **drivers**.

## How it would work

### 1. Where it lives: a Yard tab with two sub-tabs
- **Yard › Stock:** the yard stock as now, with Book In, Issue / Return, Leftovers and Stock Take.
- **Yard › Plant:** every item with:
  - where it is (the yard, a job or a van);
  - who has it;
  - how many days it's been out;
  - status (in the yard, out, waiting for a signature, overdue, lost, out of service).
- **Filters:** job, person, category and status. There's also a "Not Seen For 30+ Days" filter.

### 2. Each item has its own number
- Gas cylinders and cages are added as **numbered items** ("Propane 47kg #01 to #20"). **Add Several** creates a batch in one go.
- **Optional:** print QR / number labels, so a phone scan opens the item (a later step).
- This is what stops losses. A count of "17 cylinders" can't tell you who has #12.

### 3. The life of an item
1. **Allocate:** a PM allocates an item to an **operative and a job**, or an operative **requests** it and the PM approves.
2. **Notification:** the operative gets a push and an in-app message: "Sign for Propane #12 – Studley Rd".
3. **Sign for it:** the operative opens it and **signs to accept** it, after the pre-use checklist. From that moment it's **theirs**: it shows on their **My Plant** list, and the register says "With Jake M. at Studley Rd since 4 Nov".
4. **Moving between jobs:** the holder (or the PM) moves it, and it stays with that person.
5. **Returning it:**
   - **The operative drops it off** at the yard or a job: they sign it back **with a photo** (required). The PM or yard manager confirms. Until then it shows "returned, waiting to be confirmed".
   - **A PM returns it themselves:** they just sign. No photo is needed.
6. **Lost / damaged:** it's marked with a note. The item stays on record, and the last person who signed is shown.

### 4. Drivers and deliveries
- On a **delivery task**, the PM can add plant items as well as materials ("Take Propane #12 and #13 to Studley Rd").
- **At the yard:** the driver signs to collect, so the items are **with the driver** while on the van.
- **At the site:** the driver drops off with a photo. The item then goes to the job, or to the named operative, who gets the sign-for-it notification.
- **Collections work the other way round:** the driver collects from site, signs, and books it back into the yard.

### 5. Nothing slips through
- **The register always shows the last person who signed.**
- **Reminders:** an operative holding plant at a job that has closed, or plant out for longer than a set number of days (e.g. 14), shows in **Overdue**. Both the operative and the PM get a reminder.
- **Leaving the company:** when someone is deactivated, the plant they still hold is listed first.
- **Every movement is logged**, with who, when, where, photo and signature.

## Questions for Andy
These are asked in the app at the same time as this write-up.
1. **Where does the Yard tab go?** Finance › Purchases, a Yard page for managers on the Projects side, or both?
2. **Does a PM need to approve an operative's request,** or does the operative just sign for it?
3. **Charging jobs for your own plant:** should an item have a daily or weekly rate that goes on the job's costs while it's there, like hired plant?
4. **Returns:** must every drop-off be confirmed by a PM or yard manager, or does the operative's signature and photo close it?
