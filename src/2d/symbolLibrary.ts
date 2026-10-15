import type { PieceType } from "../catalog";
import type { ArchitecturalShape } from "./ArchitecturalSymbol";
import type { FixtureShape } from "./FixtureSymbol";

/**
 * Top-down 2D architectural symbols used by FurnitureSymbol.tsx.
 *
 * Coordinates / footprints are in metres:
 *   width = X axis
 *   depth = Z/Y plan depth
 *
 * FurnitureSymbol.tsx is the visual renderer; this file is the metadata
 * catalogue that tells the editor which symbol to render and its footprint.
 */
export type SymbolShape =
  // Architectural
  | ArchitecturalShape
  // Fixtures
  | FixtureShape
  // Living room
  | "sofa"
  | "sectional"
  | "armchair"
  | "loveseat"
  | "ottoman"
  | "coffeeTable"
  | "sideTable"
  | "console"
  | "tvUnit"
  | "rug"
  | "tv"
  |"recliner"
  |"chaise"
  |"consoleTable"
  |"meetingTable"


  // Bedroom
  | "bed"
  | "nightstand"
  | "dresser"
  | "wardrobe"
  | "vanity"
  | "bench"
  |"bunkBed"
  |"crib"


  // Dining
  | "table"
  | "roundTable"
  | "diningSet"
  | "barTable"
  | "barStool"
  | "chair"

  // Office
  | "desk"
  | "officeChair"
  | "bookcase"
  | "filingCabinet"

  // Storage
  | "cabinet"
  | "shelf"
  | "shoeCabinet"

  // Kitchen
  | "counter"
  | "kitchenIsland"
  | "sink"
  | "stove"
  | "oven"
  | "fridge"
  | "dishwasher"
  | "microwave"

  // Bathroom
  | "toilet"
  | "basin"
  | "bathtub"
  | "shower"
  | "showerEnclosure"
  | "bidet"

  // Utility
  | "washer"
  | "dryer"

  // Decor
  | "plant"
  | "lamp"
  | "floorLamp"
  | "mirror"

  // Entertainment / miscellaneous
  | "piano"
  | "fireplace";

export const FURNITURE_CATEGORIES = [
  "Living",
  "Bedroom",
  "Dining",
  "Kitchen",
  "Bathroom",
  "Office",
  "Decor",
  "Architecture",
  "Fixtures",
] as const;

export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

export interface FurnitureSymbolDef {
  id: string;
  label: string;
  category: FurnitureCategory;
  shape: SymbolShape;
  width: number;
  depth: number;
  pieceTypes?: PieceType[];
  height: number;
  renderer?: "furniture" | "architectural" | "fixture";
}

/**
 * Symbol catalogue.
 *
 * The shape names intentionally match the switch cases in FurnitureSymbol.tsx.
 * This prevents the library from silently falling back to the wrong drawing
 * when a symbol is selected.
 */
export const FURNITURE_SYMBOLS: FurnitureSymbolDef[] = [
  // ---------------------------------------------------------------------------
  // Architecture
  // ---------------------------------------------------------------------------
  {
    id: "architecture-door",
    label: "Door",
    category: "Architecture",
    shape: "door",
    width: 0.9,
    depth: 0.12,
    height: 2.1,
    renderer: "architectural",
  },
  {
    id: "architecture-double-door",
    label: "Double Door",
    category: "Architecture",
    shape: "doubleDoor",
    width: 1.8,
    depth: 0.12,
    height: 2.1,
    renderer: "architectural",
  },
  {
    id: "architecture-sliding-door",
    label: "Sliding Door",
    category: "Architecture",
    shape: "slidingDoor",
    width: 1.8,
    depth: 0.12,
    height: 2.1,
    renderer: "architectural",
  },
  {
    id: "architecture-window",
    label: "Window",
    category: "Architecture",
    shape: "window",
    width: 1.2,
    depth: 0.12,
    height: 1.2,
    renderer: "architectural",
  },
  {
    id: "architecture-stairs",
    label: "Stairs",
    category: "Architecture",
    shape: "stairs",
    width: 1,
    depth: 2.4,
    height: 2.8,
    renderer: "architectural",
  },
  {
    id: "architecture-column",
    label: "Column",
    category: "Architecture",
    shape: "column",
    width: 0.4,
    depth: 0.4,
    height: 2.8,
    renderer: "architectural",
  },
  {
    id: "architecture-fireplace",
    label: "Fireplace",
    category: "Architecture",
    shape: "fireplace",
    width: 1.4,
    depth: 0.45,
    height: 1,
    renderer: "architectural",
  },

  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------
  {
    id: "fixture-toilet",
    label: "Toilet",
    category: "Fixtures",
    shape: "toilet",
    width: 0.4,
    depth: 0.7,
    height: 0.75,
    renderer: "fixture",
  },
  {
    id: "fixture-bidet",
    label: "Bidet",
    category: "Fixtures",
    shape: "bidet",
    width: 0.4,
    depth: 0.6,
    height: 0.4,
    renderer: "fixture",
  },
  {
    id: "fixture-urinal",
    label: "Urinal",
    category: "Fixtures",
    shape: "urinal",
    width: 0.4,
    depth: 0.35,
    height: 0.6,
    renderer: "fixture",
  },
  {
    id: "fixture-basin",
    label: "Basin",
    category: "Fixtures",
    shape: "basin",
    width: 0.6,
    depth: 0.45,
    height: 0.85,
    renderer: "fixture",
  },
  {
    id: "fixture-double-basin",
    label: "Double Basin",
    category: "Fixtures",
    shape: "doubleBasin",
    width: 1.2,
    depth: 0.5,
    height: 0.85,
    renderer: "fixture",
  },
  {
    id: "fixture-vanity",
    label: "Vanity Unit",
    category: "Fixtures",
    shape: "vanityUnit",
    width: 1.2,
    depth: 0.55,
    height: 0.85,
    renderer: "fixture",
  },
  {
    id: "fixture-mirror",
    label: "Mirror",
    category: "Fixtures",
    shape: "mirror",
    width: 0.8,
    depth: 0.05,
    height: 1.2,
    renderer: "fixture",
  },
  {
    id: "fixture-bathtub",
    label: "Bathtub",
    category: "Fixtures",
    shape: "bathtub",
    width: 1.7,
    depth: 0.75,
    height: 0.55,
    renderer: "fixture",
  },
  {
    id: "fixture-shower",
    label: "Shower",
    category: "Fixtures",
    shape: "shower",
    width: 0.9,
    depth: 0.9,
    height: 2,
    renderer: "fixture",
  },
  {
    id: "fixture-kitchen-sink",
    label: "Kitchen Sink",
    category: "Fixtures",
    shape: "kitchenSink",
    width: 0.8,
    depth: 0.6,
    height: 0.9,
    renderer: "fixture",
  },
  {
    id: "fixture-oven",
    label: "Oven",
    category: "Fixtures",
    shape: "oven",
    width: 0.6,
    depth: 0.6,
    height: 0.9,
    renderer: "fixture",
  },
  {
    id: "fixture-microwave",
    label: "Microwave",
    category: "Fixtures",
    shape: "microwave",
    width: 0.6,
    depth: 0.45,
    height: 0.35,
    renderer: "fixture",
  },

  // ---------------------------------------------------------------------------
  // Living
  // ---------------------------------------------------------------------------
  {
    id: "sofa-3",
    label: "3-Seat Sofa",
    category: "Living",
    shape: "sofa",
    width: 2.1,
    depth: 0.9,
    pieceTypes: ["sofa"],
    height: 0.85,
  },
  {
    id: "sofa-2",
    label: "Loveseat",
    category: "Living",
    shape: "loveseat",
    width: 1.6,
    depth: 0.85,
    pieceTypes: ["sofa"],
    height: 0.85,
  },
  {
    id: "sectional",
    label: "L-Shaped Sofa",
    category: "Living",
    shape: "sectional",
    width: 2.6,
    depth: 1.7,
    pieceTypes: ["sectional"],
    height: 0.85,
  },
  {
    id: "armchair",
    label: "Armchair",
    category: "Living",
    shape: "armchair",
    width: 0.85,
    depth: 0.85,
    pieceTypes: ["armchair"],
    height: 0.85,
  },
  {
    id: "ottoman",
    label: "Ottoman",
    category: "Living",
    shape: "ottoman",
    width: 0.9,
    depth: 0.7,
    height: 0.45,
  },
  {
    id: "coffee-table",
    label: "Coffee Table",
    category: "Living",
    shape: "coffeeTable",
    width: 1.2,
    depth: 0.6,
    pieceTypes: ["coffee-table"],
    height: 0.45,
  },
  {
    id: "coffee-table-round",
    label: "Round Coffee Table",
    category: "Living",
    shape: "roundTable",
    width: 0.8,
    depth: 0.8,
    pieceTypes: ["coffee-table"],
    height: 0.45,
  },
  {
    id: "side-table",
    label: "Side Table",
    category: "Living",
    shape: "sideTable",
    width: 0.5,
    depth: 0.5,
    pieceTypes: ["side-table"],
    height: 0.55,
  },
  {
    id: "console",
    label: "Console Table",
    category: "Living",
    shape: "console",
    width: 1.4,
    depth: 0.4,
    height: 0.8,
  },
  {
    id: "tv-unit",
    label: "TV Unit",
    category: "Living",
    shape: "tvUnit",
    width: 1.8,
    depth: 0.45,
    pieceTypes: ["tv-unit", "sideboard"],
    height: 0.5,
  },
  {
    id: "tv",
    label: "Television",
    category: "Living",
    shape: "tv",
    width: 1.2,
    depth: 0.08,
    height: 0.7,
  },
  {
    id: "bookshelf",
    label: "Bookshelf",
    category: "Living",
    shape: "bookcase",
    width: 1.0,
    depth: 0.35,
    pieceTypes: ["bookshelf"],
    height: 1.8,
  },
  {
    id: "rug",
    label: "Rug",
    category: "Decor",
    shape: "rug",
    width: 2.0,
    depth: 1.4,
    height: 0.02,
  },

  // ---------------------------------------------------------------------------
  // Bedroom
  // ---------------------------------------------------------------------------
  {
    id: "bed-king",
    label: "King Bed",
    category: "Bedroom",
    shape: "bed",
    width: 1.93,
    depth: 2.03,
    pieceTypes: ["bed"],
    height: 0.6,
  },
  {
    id: "bed-queen",
    label: "Queen Bed",
    category: "Bedroom",
    shape: "bed",
    width: 1.52,
    depth: 2.03,
    pieceTypes: ["bed"],
    height: 0.6,
  },
  {
    id: "bed-single",
    label: "Single Bed",
    category: "Bedroom",
    shape: "bed",
    width: 0.97,
    depth: 1.9,
    pieceTypes: ["bed"],
    height: 0.55,
  },
  {
    id: "nightstand",
    label: "Nightstand",
    category: "Bedroom",
    shape: "nightstand",
    width: 0.5,
    depth: 0.4,
    pieceTypes: ["nightstand"],
    height: 0.55,
  },
  {
    id: "wardrobe",
    label: "Wardrobe",
    category: "Bedroom",
    shape: "wardrobe",
    width: 1.2,
    depth: 0.6,
    pieceTypes: ["wardrobe"],
    height: 2,
  },
  {
    id: "dresser",
    label: "Dresser",
    category: "Bedroom",
    shape: "dresser",
    width: 1.4,
    depth: 0.5,
    pieceTypes: ["dresser", "sideboard"],
    height: 0.8,
  },
  {
    id: "vanity",
    label: "Vanity",
    category: "Bedroom",
    shape: "vanity",
    width: 1.2,
    depth: 0.55,
    height: 0.75,
  },
  {
    id: "bed-bench",
    label: "Bed Bench",
    category: "Bedroom",
    shape: "bench",
    width: 1.2,
    depth: 0.4,
    height: 0.45,
  },

  // ---------------------------------------------------------------------------
  // Dining
  // ---------------------------------------------------------------------------
  {
    id: "dining-set-4",
    label: "Dining Set (4)",
    category: "Dining",
    shape: "diningSet",
    width: 1.4,
    depth: 1.5,
    height: 0.75,
  },
  {
    id: "dining-table-6",
    label: "Dining Table (6)",
    category: "Dining",
    shape: "table",
    width: 1.8,
    depth: 0.9,
    pieceTypes: ["dining-table"],
    height: 0.75,
  },
  {
    id: "dining-table-round",
    label: "Round Dining Table",
    category: "Dining",
    shape: "roundTable",
    width: 1.1,
    depth: 1.1,
    pieceTypes: ["dining-table"],
    height: 0.75,
  },
  {
    id: "dining-chair",
    label: "Dining Chair",
    category: "Dining",
    shape: "chair",
    width: 0.45,
    depth: 0.5,
    pieceTypes: ["dining-chair"],
    height: 0.9,
  },
  {
    id: "sideboard",
    label: "Sideboard",
    category: "Dining",
    shape: "cabinet",
    width: 1.6,
    depth: 0.45,
    pieceTypes: ["sideboard"],
    height: 0.85,
  },
  {
    id: "bench",
    label: "Bench",
    category: "Dining",
    shape: "bench",
    width: 1.2,
    depth: 0.4,
    pieceTypes: ["bench"],
    height: 0.45,
  },
  {
    id: "bar-table",
    label: "Bar Table",
    category: "Dining",
    shape: "barTable",
    width: 1.2,
    depth: 0.6,
    height: 1.05,
  },
  {
    id: "bar-stool",
    label: "Bar Stool",
    category: "Dining",
    shape: "barStool",
    width: 0.45,
    depth: 0.45,
    height: 1.0,
  },

  // ---------------------------------------------------------------------------
  // Office
  // ---------------------------------------------------------------------------
  {
    id: "desk",
    label: "Desk",
    category: "Office",
    shape: "desk",
    width: 1.4,
    depth: 0.7,
    pieceTypes: ["desk"],
    height: 0.75,
  },
  {
    id: "office-chair",
    label: "Office Chair",
    category: "Office",
    shape: "officeChair",
    width: 0.6,
    depth: 0.6,
    pieceTypes: ["office-chair"],
    height: 1,
  },
  {
    id: "filing-cabinet",
    label: "Filing Cabinet",
    category: "Office",
    shape: "filingCabinet",
    width: 0.5,
    depth: 0.6,
    pieceTypes: ["filing-cabinet"],
    height: 0.7,
  },
  {
    id: "office-shelf",
    label: "Office Shelf",
    category: "Office",
    shape: "bookcase",
    width: 1.6,
    depth: 0.4,
    pieceTypes: ["bookshelf"],
    height: 1.8,
  },

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  {
    id: "cabinet",
    label: "Storage Cabinet",
    category: "Living",
    shape: "cabinet",
    width: 1.0,
    depth: 0.45,
    height: 0.9,
  },
  {
    id: "shelf",
    label: "Wall Shelf",
    category: "Living",
    shape: "shelf",
    width: 1.2,
    depth: 0.3,
    height: 1.2,
  },
  {
    id: "shoe-cabinet",
    label: "Shoe Cabinet",
    category: "Living",
    shape: "shoeCabinet",
    width: 1.0,
    depth: 0.35,
    height: 1.0,
  },

  // ---------------------------------------------------------------------------
  // Kitchen
  // ---------------------------------------------------------------------------
  {
    id: "fridge",
    label: "Fridge",
    category: "Kitchen",
    shape: "fridge",
    width: 0.7,
    depth: 0.7,
    height: 1.8,
  },
  {
    id: "stove",
    label: "Stove",
    category: "Kitchen",
    shape: "stove",
    width: 0.6,
    depth: 0.6,
    height: 0.9,
  },
  {
    id: "oven",
    label: "Oven",
    category: "Kitchen",
    shape: "oven",
    width: 0.6,
    depth: 0.6,
    height: 0.9,
  },
  {
    id: "kitchen-sink",
    label: "Kitchen Sink",
    category: "Kitchen",
    shape: "sink",
    width: 0.8,
    depth: 0.6,
    height: 0.9,
  },
  {
    id: "counter",
    label: "Counter",
    category: "Kitchen",
    shape: "counter",
    width: 1.2,
    depth: 0.6,
    pieceTypes: ["counter"],
    height: 0.9,
  },
  {
    id: "island",
    label: "Kitchen Island",
    category: "Kitchen",
    shape: "kitchenIsland",
    width: 1.8,
    depth: 0.9,
    pieceTypes: ["counter"],
    height: 0.9,
  },
  {
    id: "dishwasher",
    label: "Dishwasher",
    category: "Kitchen",
    shape: "dishwasher",
    width: 0.6,
    depth: 0.6,
    height: 0.85,
  },
  {
    id: "microwave",
    label: "Microwave",
    category: "Kitchen",
    shape: "microwave",
    width: 0.6,
    depth: 0.45,
    height: 0.35,
  },

  // ---------------------------------------------------------------------------
  // Bathroom
  // ---------------------------------------------------------------------------
  {
    id: "toilet",
    label: "Toilet",
    category: "Bathroom",
    shape: "toilet",
    width: 0.4,
    depth: 0.7,
    height: 0.75,
  },
  {
    id: "bath-sink",
    label: "Bathroom Sink",
    category: "Bathroom",
    shape: "basin",
    width: 0.6,
    depth: 0.45,
    height: 0.85,
  },
  {
    id: "bathtub",
    label: "Bathtub",
    category: "Bathroom",
    shape: "bathtub",
    width: 1.7,
    depth: 0.75,
    height: 0.55,
  },
  {
    id: "shower",
    label: "Shower",
    category: "Bathroom",
    shape: "shower",
    width: 0.9,
    depth: 0.9,
    height: 2,
  },
  {
    id: "shower-enclosure",
    label: "Shower Enclosure",
    category: "Bathroom",
    shape: "showerEnclosure",
    width: 0.9,
    depth: 0.9,
    height: 2,
  },
  {
    id: "bidet",
    label: "Bidet",
    category: "Bathroom",
    shape: "bidet",
    width: 0.4,
    depth: 0.6,
    height: 0.4,
  },
  {
    id: "washer",
    label: "Washing Machine",
    category: "Bathroom",
    shape: "washer",
    width: 0.6,
    depth: 0.6,
    height: 0.85,
  },
  {
    id: "dryer",
    label: "Dryer",
    category: "Bathroom",
    shape: "dryer",
    width: 0.6,
    depth: 0.6,
    height: 0.85,
  },

  // ---------------------------------------------------------------------------
  // Decor / miscellaneous
  // ---------------------------------------------------------------------------
  {
    id: "plant",
    label: "Plant",
    category: "Decor",
    shape: "plant",
    width: 0.5,
    depth: 0.5,
    height: 1,
  },
  {
    id: "plant-large",
    label: "Large Plant",
    category: "Decor",
    shape: "plant",
    width: 0.8,
    depth: 0.8,
    height: 1.6,
  },
  {
    id: "lamp",
    label: "Table Lamp",
    category: "Decor",
    shape: "lamp",
    width: 0.3,
    depth: 0.3,
    height: 0.55,
  },
  {
    id: "floor-lamp",
    label: "Floor Lamp",
    category: "Decor",
    shape: "floorLamp",
    width: 0.4,
    depth: 0.4,
    pieceTypes: [],
    height: 1.6,
  },
  {
    id: "mirror",
    label: "Mirror",
    category: "Decor",
    shape: "mirror",
    width: 0.8,
    depth: 0.05,
    height: 1.2,
  },
  {
    id: "piano",
    label: "Upright Piano",
    category: "Decor",
    shape: "piano",
    width: 1.5,
    depth: 0.6,
    height: 1.25,
  },
  {
    id: "fireplace",
    label: "Fireplace",
    category: "Living",
    shape: "fireplace",
    width: 1.4,
    depth: 0.45,
    height: 1.0,
  },
];

export const SYMBOL_BY_ID: Record<string, FurnitureSymbolDef> = Object.fromEntries(
  FURNITURE_SYMBOLS.map((symbol) => [symbol.id, symbol])
);
