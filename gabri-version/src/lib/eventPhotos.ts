/**
 * Photos for events on the map (banners and their hover cards), picked by what the event is.
 * Freely licensed photos from Wikimedia Commons, credited on /credits. Events with no match show their type icon.
 */
export interface EventPhoto { src: string; credit: { title: string; author: string; license: string; source: string } }

export const PHOTO_CREDITS = {
  soccer: {"title": "BacchusMarshDarleyPark", "author": "Mattinbgn", "license": "CC BY-SA 3.0", "source": "https://commons.wikimedia.org/wiki/File:BacchusMarshDarleyPark.JPG"},
  basketball: {"title": "Basketball pickup game san diego", "author": "Somepdimages", "license": "CC0", "source": "https://commons.wikimedia.org/wiki/File:Basketball_pickup_game_san_diego.jpg"},
  study: {"title": "HK Shek Tong Tsui 石塘咀 公共圖書館 Public Library study room interior table row October 2016 Lnv", "author": "Woo Guao Heung", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:HK_Shek_Tong_Tsui_%E7%9F%B3%E5%A1%98%E5%92%80_%E5%85%AC%E5%85%B1%E5%9C%96%E6%9B%B8%E9%A4%A8_Public_Library_study_room_interior_table_row_October_2016_Lnv.jpg"},
  pitch: {"title": "TechCrunch Disrupt Berlin 2017 (32246713818)", "author": "TechCrunch", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:TechCrunch_Disrupt_Berlin_2017_(32246713818).jpg"},
  boba: {"title": "2009-12-30 cups of bubble tea at a Chunshuitang in Taipei", "author": "takuma mori", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:2009-12-30_cups_of_bubble_tea_at_a_Chunshuitang_in_Taipei.jpg"},
  career: {"title": "Corps talks jobs at GPS Career Fair (10019363093)", "author": "U.S. Army Corps of Engineers from USA", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:Corps_talks_jobs_at_GPS_Career_Fair_(10019363093).jpg"},
  hackathon: {"title": "Wikimedia Morocco Mini-Hackathon 2026 day 1 - Participants working on laptops in a conference room - 0014", "author": "DERDAKI ILIAS", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:Wikimedia_Morocco_Mini-Hackathon_2026_day_1_-_Participants_working_on_laptops_in_a_conference_room_-_0014.jpg"},
  yoga: {"title": "Outdoor Yoga At the Park", "author": "Vuemobi Media", "license": "CC BY-SA 2.0", "source": "https://commons.wikimedia.org/wiki/File:Outdoor_Yoga_At_the_Park.jpg"},
  jazz: {"title": "New Orleans Jazz & Heritage Fest Early 1990s Banu Gibson Band on stage", "author": "Infrogmation of New Orleans", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:New_Orleans_Jazz_%26_Heritage_Fest_Early_1990s_Banu_Gibson_Band_on_stage.jpg"},
  dinner: {"title": "DSC 7074 A group of friends enjoying dinner and wine at a cozy restaurant seated around a table with a red tablecloth and bottles displayed on the wall behind them", "author": "PattayaPatrol", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:DSC_7074_A_group_of_friends_enjoying_dinner_and_wine_at_a_cozy_restaurant_seated_around_a_table_with_a_red_tablecloth_and_bottles_displayed_on_the_wall_behind_them.jpg"},
  volleyball: {"title": "People playing volleyball at Ibirapuera Park, Sao Paulo", "author": "Slyronit", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:People_playing_volleyball_at_Ibirapuera_Park,_Sao_Paulo.jpg"},
  newsroom: {"title": "Al Jazeera English Newsroom", "author": "Wittylama", "license": "CC BY-SA 3.0", "source": "https://commons.wikimedia.org/wiki/File:Al_Jazeera_English_Newsroom.jpg"},
  museum: {"title": "Dinosaur statues outside NHMLAC", "author": "Rlumstead", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:Dinosaur_statues_outside_NHMLAC.jpg"},
  spikeball: {"title": "Spikeball game", "author": "Esmé James @ezy_bezzie", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:Spikeball_game.jpg"},
  tacos: {"title": "001 Tacos de carnitas, carne asada y al pastor", "author": "Larry Miller", "license": "CC BY-SA 2.0", "source": "https://commons.wikimedia.org/wiki/File:001_Tacos_de_carnitas,_carne_asada_y_al_pastor.jpg"},
} as const;
type Key = keyof typeof PHOTO_CREDITS;

// title first (most specific), then the event type
const RULES: [RegExp, Key][] = [
  [/spikeball|roundnet/i, "spikeball"],
  [/volleyball/i, "volleyball"],
  [/basketball|hoops/i, "basketball"],
  [/soccer|futbol/i, "soccer"],
  [/yoga|pilates|meditat/i, "yoga"],
  [/jazz|concert|orchestra|symphony|music|band|recital/i, "jazz"],
  [/hackathon|hack night|build night|garage/i, "hackathon"],
  [/pitch|demo day|founder|startup/i, "pitch"],
  [/boba|bubble tea/i, "boba"],
  [/taco/i, "tacos"],
  [/dinner|brunch|potluck|birthday/i, "dinner"],
  [/museum|first fridays|exhibit/i, "museum"],
  [/newsroom|journalis|daily trojan/i, "newsroom"],
  [/resume|career|recruit|analyst|coffee chat|internship|info session|networking/i, "career"],
  [/study|review|midterm|final|tutor|peer review|office hours|homework/i, "study"],
];
const BY_TYPE: Partial<Record<string, Key>> = { career: "career", academic: "study" };

export function eventPhoto(e: { title: string; category: string }): EventPhoto | null {
  const key = RULES.find(([re]) => re.test(e.title))?.[1] ?? BY_TYPE[e.category];
  return key ? { src: `/img/events/${key}.jpg`, credit: PHOTO_CREDITS[key] } : null;
}
