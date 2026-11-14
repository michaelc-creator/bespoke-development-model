# Bespoke Underwriting Development Model

Standalone version of the Bespoke Underwriting modular development model (from bespokeunderwriting.com/core).

Enter a property address (map + nearest factory route), number of units, and square feet per unit. Land cost auto-fills from the county's assessed land value where the county is covered; building cost is estimated from the factory rate ($/sf) and project square footage.

Static site served by GitHub Pages. Address geocoding and the county assessed-land lookup use the existing public endpoints on bespokeunderwriting.com; maps use Leaflet with OpenStreetMap tiles (no API key).
