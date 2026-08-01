# Japanese level-crossing dimensional basis

Blender uses metres and the exported GLB is authored at 1 unit = 1 metre.
The asset is based on the following coherent set of Japanese production equipment.

| Part | Adopted model / basis | Authored dimensions |
| --- | --- | --- |
| Warning mast | Traffic System Electric B-II / AD3100B | pipe OD 114.3 mm, length 4,100 mm; base flange 500 mm diameter x 16 mm; anchor pitch 297 mm square |
| Warning lamps | Tetsuden EP1506H horizontal arrangement | effective luminous diameter 170 mm; two lamps on one horizontal crossbar, 720 mm modelled centre spacing, 3,180 mm lens-centre height; 280 mm casing OD |
| Crossing sign | Toho SD43002003-01 | each aluminium board 1,200 x 180 mm |
| Direction indicator | Toho SD502417-01 | W430 x H390 x D242 mm |
| Alarm speaker | Toho SI6061B009-01 | W232 x H152 x D370 mm from mast centre |
| Emergency operator | Toho SD4033-series buzzer type | W250 x H290 x D130 mm, excluding projections |
| Gate machine | Nippon Signal SC type | W405 x D275 x H1,065 mm, excluding projections |
| Barrier pole | Yoshiwara SC-4 | overall length 4.27 m; conventional tapered pole OD 60 mm at root to 30 mm at tip |

Visual elements inside those envelopes are proportioned from the corresponding
manufacturer photographs. The SD502417-01 arrow graphics are W206 x H92 mm
(W235 x H105 mm including their dark border), leaving the large vertical gaps
visible on the production faceplate. Their heads use two open diagonal strokes
forming the production chevron shape; there is no filled triangular arrowhead,
and the horizontal stroke continues to the chevron apex. The gate counter guard is one 340 x 55 x
735 mm mesh using `public/textures/railway/gate_counter_hazard_stripes.png`;
the yellow/black bands are not separate geometry.

The barrier-arm colour bands follow JIS E 3701:1995 sections 3.3.3 and
3.3.2(2)(a). This asset uses the narrow end of the permitted range: yellow
180 mm, black 120 mm, maintaining the prescribed approximate 3:2 ratio. One
300 mm colour period is repeated 13.0333 times over the 3.91 m textured portion
of the SC-4 arm. The side-wall UVs are projected directly from the arm's local
longitudinal coordinate; end-cap UVs are excluded from the repeat calculation.
The separate red reflective markers remain independent decals.

The manufacturer catalog distinguishes EP1506F (vertical) from EP1506H
(horizontal), so this asset now uses the latter arrangement. The published
product value is the 170 mm effective luminous diameter. The 720 mm lamp-centre
spacing and 280 mm casing envelope are reference-calibrated installation values:
they were measured from the supplied near-front photograph using both the
verified 114.3 mm mast OD and the 170 mm luminous aperture as independent scale
checks. They are recorded as layout values, not misrepresented as universal
manufacturer dimensions. The support is a 48.6 mm OD, 1,020 mm long common
crossbar with two independent collars, hanging yokes, a split mast clamp,
standoffs, and fasteners.

Each warning-lamp rolled visor is fitted to the 280 mm lamp casing diameter;
it no longer follows a larger arbitrary exterior envelope.

The direction indicator retains the verified 430 x 390 x 242 mm product
envelope. Its fabricated 4 mm hood is 468 mm wide and projects 236 mm beyond
the display face. In side elevation, the upper edge extends horizontally, the
nose drops vertically, and the lower edge returns diagonally to the bottom of
the housing; folded drip returns replace a large cosmetic bevel. A separate rear-side junction enclosure, removable
service lid, cable glands, underbody angle rail, and mast clamp reproduce the
visible installation structure in the supplied close-up reference.

## Source references

- Traffic System Electric warning mast: https://www.tsec.co.jp/business/01.html
- Toho crossing sign: https://www.ipros.com/product/detail/2001490001/
- Toho direction indicator: https://www.ipros.com/product/detail/2001490014/
- Toho speaker: https://mono.ipros.com/product/detail/2001490021/
- Toho emergency operator: https://mono.ipros.com/en/product/detail/2001490029/
- Nippon Signal SC gate: https://www.signal.co.jp/wordpress/wp-content/uploads/2025/11/10_crossinggate202511.pdf
- Yoshiwara barrier pole: https://yoshiwara.co.jp/products/crossing/product-4740/
- Conventional barrier-pole taper: https://patents.google.com/patent/JPH08198112A/ja
- Tetsuden standard lamp effective diameter: https://www.tetsuden.com/docs2020renewal/wp-content/themes/tetsuden/pdf/catalog/05.pdf
- Japanese patent description of the conventional two-lamp alternating pair: https://patents.google.com/patent/JP5264538B2/ja
- JIS E 3701:1995 safety-colour requirements: https://webdesk.jsa.or.jp/books/W11M0090/index/?bunsyo_id=JIS+E+3701%3A1995

Concrete foundations, cable routing, mounting heights, lamp spacing, and minor brackets are site-designed rather than universal product dimensions. They are proportioned to the verified equipment envelopes and standard pipe/fastener sizes; published product dimensions are kept distinct from photograph-calibrated installation dimensions above.
