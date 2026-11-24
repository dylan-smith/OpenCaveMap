# Measurements are stored in metres

Surveyors record distances and depths in either feet or metres, and a project's unit system can be switched at any time. We store every distance and depth in metres and convert only when a value is entered or shown, so the unit system is purely a presentation setting and switching it never changes the data.

## Considered Options

- **Store the number as typed, with its unit.** Keeps the literal slate value, but every calculation and every later feature (mapping, totals, tying segments together) would have to handle mixed units.
- **Fix one unit system per project and store in it.** Simple, but changing the setting later would mean either relabelling the numbers (corrupting them) or converting them in place.
