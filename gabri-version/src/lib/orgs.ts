/** Student orgs and departments. Kept apart from the demo seed so browser code can import it without the seed data. */
import type { Org } from "./types";

export const ORGS: Org[] = [
  // Real USC orgs and offices. Names, descriptions, sites and logos come from the EngageSC directory
  // (engage.usc.edu) and each org's own site; nothing here is invented. members: 0 = no source states it.
  { id: "org_usg", name: "Undergraduate Student Government", school: "all", kind: "usg", members: 0,
    description: "The official governing body of USC's nearly 20,000 undergraduates: advocacy, legislation, programming and funding.",
    website: "https://usg.usc.edu", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2024/image_upload_2523131_USG2122Monogram01_1229153120.png" },
  { id: "org_startup", name: "tiehub (Viterbi Innovation & Entrepreneurship)", school: "viterbi", kind: "department", members: 0,
    description: "Viterbi's entrepreneurship hub: helps students turn ideas into tech ventures and runs the Maseeh Entrepreneurship Prize Competition, Trojan Tank and Origin Weekend.",
    website: "https://viterbiinnovation.usc.edu/", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2025/image_upload_2563107_IMG_2209_124172934.png" },
  { id: "org_boba", name: "Spoon University USC", school: "all", kind: "club", members: 0,
    description: "USC's chapter of Spoon University, a student food publication sharing recipes, food hacks and restaurants around campus.",
    website: "https://spoonuniversity.com/school/usc/", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2025/image_upload_2561542_Spoon_logo_11620307.jpeg" },
  { id: "org_finance", name: "Trojan Investing Society", school: "marshall", kind: "club", members: 0,
    description: "Founded in 1997, USC's undergraduate finance club, with investment banking, buy-side and leadership programs.",
    website: "https://trojaninvestingsociety.com/", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2025/image_upload_2575312_Heads_Letter_Symbol_Coin_Logo_2_7310421.png" },
  { id: "org_jazz", name: "USC Thornton Jazz Orchestra", school: "thornton", kind: "department", members: 0,
    description: "The flagship big band of USC Thornton's Jazz Studies program, directed by saxophonist Bob Mintzer.",
    website: "https://music.usc.edu/ensemble/usc-thornton-jazz-orchestra/", logo: "https://music.usc.edu/wp-content/themes/music-2021/images/apple-touch-icon-retina.png" },
  { id: "org_dt", name: "Daily Trojan", school: "all", kind: "club", members: 0,
    description: "USC's student newspaper, written, edited and managed by students.",
    website: "https://dailytrojan.com", logo: "https://dailytrojan.com/images-dte/dt14.png" },
  { id: "org_career", name: "USC Career Center", school: "all", kind: "department", members: 0,
    description: "USC's central career office: helps Trojans discover, develop and thrive in their professional pursuits.",
    website: "https://careers.usc.edu/", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2024/image_upload_2568088_CCHandshakeLogoBlkGold_63017234.png" },
  { id: "org_hacksc", name: "HackSC", school: "all", kind: "club", members: 0,
    description: "Runs USC's student hackathon in Los Angeles: a weekend of workshops, speakers and building for 800+ hackers.",
    website: "https://hacksc.com", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2022/image_upload_2465562_HSC_Gray_72802443.png" },
  { id: "org_recsports", name: "USC Recreational Sports", school: "all", kind: "department", members: 0,
    description: "Fitness facilities, intramural and club sports, and personal training for the USC community.",
    website: "https://recsports.usc.edu/" },
  { id: "org_campusact", name: "USC Campus Activities", school: "all", kind: "department", members: 0,
    description: "Builds community and leadership through co-curricular programs; oversees student organizations on EngageSC.",
    website: "https://campusactivities.usc.edu/", logo: "https://static-prod-us-east-1.campusgroups.com/upload/usc/2021/image_upload_34747_image_upload_34747_u8OeYl_0jpg_7211288_1122143841.jpeg" },
];
