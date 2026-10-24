// Sample campuses (PB.5, PC.4) and active-campus resolution. All invented
// (ported from design-reference/app/data.js CAMPUSES). "harbor" is the home
// campus with the full inventory; "cedar" is the partner campus with a smaller
// live inventory; the other four appear only as Community offers/requests
// (decision #1).
export interface Campus {
  id: string;
  name: string;
  /** Distance from the home campus, miles (for Community ranking). */
  miles: number;
  region: string;
  place?: string;
  hours?: string;
  contact?: string;
  /** Campuses with a live, seeded inventory in this demo. */
  live: boolean;
}

export const CAMPUSES: Record<string, Campus> = {
  harbor: {
    id: "harbor",
    name: "Harbor University",
    miles: 0,
    region: "Greater Boston",
    place: "Student Center, room 120",
    hours: "Weekdays, 10 am to 4 pm",
    contact: "Maya, pantry manager · pantry@harbor.example",
    live: true,
  },
  cedar: {
    id: "cedar",
    name: "Cedar Hill College",
    miles: 6,
    region: "Greater Boston",
    place: "Library basement, room B12",
    hours: "Mon to Thu, 11 am to 3 pm",
    contact: "Sam Ortiz, pantry lead · pantry@cedarhill.example",
    live: true,
  },
  northfield: {
    id: "northfield",
    name: "Northfield College",
    miles: 14,
    region: "MetroWest",
    place: "Campus food pantry, Student Center room 112",
    hours: "Weekdays, 10 am to 4 pm",
    contact: "Jordan Lee, pantry manager · pantry@northfield.example",
    live: false,
  },
  riverside: {
    id: "riverside",
    name: "Riverside State",
    miles: 41,
    region: "Central MA",
    place: "Wellness Center loading dock",
    hours: "Tue and Thu, 9 am to 1 pm",
    contact: "Priya Nair · basicneeds@riverside.example",
    live: false,
  },
  bayview: {
    id: "bayview",
    name: "Bayview Community College",
    miles: 58,
    region: "South Coast",
    place: "Building C, room 140",
    hours: "Mon, Wed, Fri, noon to 5 pm",
    contact: "Chris Dube · pantry@bayview.example",
    live: false,
  },
  hillcrest: {
    id: "hillcrest",
    name: "Hillcrest University",
    miles: 88,
    region: "Pioneer Valley",
    place: "Campus Center, room 205",
    hours: "Weekdays, 1 pm to 6 pm",
    contact: "Alex Kim · foodshelf@hillcrest.example",
    live: false,
  },
};

/** The default/home campus when none is selected. */
export const HOME_CAMPUS_ID = "harbor" as const;

/** Campus ids that have a live seeded inventory (manager-switchable). */
export const LIVE_CAMPUS_IDS = Object.values(CAMPUSES)
  .filter((c) => c.live)
  .map((c) => c.id);

/** Resolve an active-campus id to a known live campus, defaulting to home. */
export function resolveActiveCampus(id: string | null | undefined): string {
  if (id && CAMPUSES[id]?.live) return id;
  return HOME_CAMPUS_ID;
}

export function campusName(id: string): string {
  return CAMPUSES[id]?.name ?? id;
}
