// สแนปช็อตยอดใช้ชิ้นส่วนเครื่องยนต์ — ใช้เมื่อดึงเอกสาร FIA ไม่ได้ (สร้างจาก lib/pu-parse.ts)
import type { PuData } from "./pu-parse";

export const PU_FALLBACK: Record<string, PuData> = {
  "2026": {
    "season": 2026,
    "event": "Spanish Grand Prix",
    "updated": "2026-09-12",
    "drivers": [
      {
        "number": "81",
        "driver": "Oscar Piastri",
        "team": "McLaren Mercedes",
        "used": {
          "ICE": 4,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 2,
          "PU-CE": 2,
          "PU-ANC": 4
        }
      },
      {
        "number": "01",
        "driver": "Lando Norris",
        "team": "McLaren Mercedes",
        "used": {
          "ICE": 4,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 3,
          "PU-CE": 4,
          "PU-ANC": 4
        }
      },
      {
        "number": "63",
        "driver": "George Russell",
        "team": "Mercedes",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 4,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 5
        }
      },
      {
        "number": "12",
        "driver": "Kimi Antonelli",
        "team": "Mercedes",
        "used": {
          "ICE": 5,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 4,
          "PU-CE": 4,
          "PU-ANC": 5
        }
      },
      {
        "number": "03",
        "driver": "Max Verstappen",
        "team": "Red Bull Racing RB Ford",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 4
        }
      },
      {
        "number": "30",
        "driver": "Liam Lawson",
        "team": "Red Bull Racing RB Ford",
        "used": {
          "ICE": 6,
          "TC": 6,
          "EXH": 6,
          "MGU-K": 4,
          "ES": 4,
          "PU-CE": 4,
          "PU-ANC": 7
        }
      },
      {
        "number": "16",
        "driver": "Charles Leclerc",
        "team": "Ferrari",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 4,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 6
        }
      },
      {
        "number": "44",
        "driver": "Lewis Hamilton",
        "team": "Ferrari",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 4,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 6
        }
      },
      {
        "number": "23",
        "driver": "Alexander Albon",
        "team": "Williams Mercedes",
        "used": {
          "ICE": 5,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 3,
          "PU-CE": 4,
          "PU-ANC": 5
        }
      },
      {
        "number": "55",
        "driver": "Carlos Sainz",
        "team": "Williams Mercedes",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 3,
          "PU-CE": 4,
          "PU-ANC": 4
        }
      },
      {
        "number": "41",
        "driver": "Arvid Lindblad",
        "team": "Racing Bulls RB Ford",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 2,
          "PU-CE": 2,
          "PU-ANC": 4
        }
      },
      {
        "number": "22",
        "driver": "Yuki Tsunoda",
        "team": "Racing Bulls RB Ford",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 2,
          "PU-CE": 2,
          "PU-ANC": 5
        }
      },
      {
        "number": "18",
        "driver": "Lance Stroll",
        "team": "Aston Martin Aramco Honda",
        "used": {
          "ICE": 5,
          "TC": 5,
          "EXH": 3,
          "MGU-K": 5,
          "ES": 6,
          "PU-CE": 5,
          "PU-ANC": 7
        }
      },
      {
        "number": "14",
        "driver": "Fernando Alonso",
        "team": "Aston Martin Aramco Honda",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 2,
          "MGU-K": 5,
          "ES": 6,
          "PU-CE": 6,
          "PU-ANC": 7
        }
      },
      {
        "number": "31",
        "driver": "Esteban Ocon",
        "team": "Haas Ferrari",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 4
        }
      },
      {
        "number": "87",
        "driver": "Oliver Bearman",
        "team": "Haas Ferrari",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 4,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 4
        }
      },
      {
        "number": "27",
        "driver": "Nico Hulkenberg",
        "team": "Audi",
        "used": {
          "ICE": 4,
          "TC": 4,
          "EXH": 4,
          "MGU-K": 3,
          "ES": 1,
          "PU-CE": 1,
          "PU-ANC": 5
        }
      },
      {
        "number": "05",
        "driver": "Gabriel Bortoleto",
        "team": "Audi",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 5
        }
      },
      {
        "number": "10",
        "driver": "Pierre Gasly",
        "team": "Alpine Mercedes",
        "used": {
          "ICE": 4,
          "TC": 3,
          "EXH": 3,
          "MGU-K": 2,
          "ES": 2,
          "PU-CE": 2,
          "PU-ANC": 5
        }
      },
      {
        "number": "43",
        "driver": "Franco Colapinto",
        "team": "Alpine Mercedes",
        "used": {
          "ICE": 4,
          "TC": 3,
          "EXH": 2,
          "MGU-K": 2,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 4
        }
      },
      {
        "number": "11",
        "driver": "Sergio Perez",
        "team": "Cadillac Ferrari",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 2,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 3
        }
      },
      {
        "number": "77",
        "driver": "Valtteri Bottas",
        "team": "Cadillac Ferrari",
        "used": {
          "ICE": 3,
          "TC": 3,
          "EXH": 2,
          "MGU-K": 3,
          "ES": 3,
          "PU-CE": 3,
          "PU-ANC": 3
        }
      }
    ],
    "penalties": [
      {
        "number": "18",
        "driver": "Lance Stroll",
        "event": "Spanish Grand Prix",
        "session": "Free Practice 3",
        "decision": "Drop of 40 grid positions for the next Race in which the driver participates.",
        "elements": [
          "5th Engine (ICE)",
          "5th Turbocharger (TC)",
          "6th Energy Store (ES)",
          "5th MGU-K",
          "7th Power Unit Ancillary Component (PU-ANC)"
        ],
        "url": "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_infringement_-_car_18_-_pu_elements_changed.pdf"
      },
      {
        "number": "14",
        "driver": "Fernando Alonso",
        "event": "Italian Grand Prix",
        "session": "Qualifying",
        "decision": "Required to start the Race from the pit lane.",
        "elements": [
          "6th Energy Store (ES)",
          "6th Control Electronics Unit (PU-CE)",
          "5th MGU-K"
        ],
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_14_-_pu_elements_changed_during_parc_ferme.pdf"
      },
      {
        "number": "30",
        "driver": "Liam Lawson",
        "event": "Italian Grand Prix",
        "session": "Free Practice 3",
        "decision": "Drop of 35 grid positions for the next Race in which the driver participates.",
        "elements": [
          "6th Engine (ICE)",
          "6th Turbocharger (TC)",
          "6th Exhaust Set (EXH)",
          "4th MGU-K",
          "7th Power Unit Ancillary Component (PU-ANC)"
        ],
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_30_-_change_to_pu_elements.pdf"
      },
      {
        "number": "23",
        "driver": "Alexander Albon",
        "event": "Italian Grand Prix",
        "session": "Free Practice 1",
        "decision": "Drop of 20 grid positions for the next Race in which the driver participates.",
        "elements": [
          "5th Engine (ICE)",
          "4th Control Electronics Unit (PU-CE)"
        ],
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_23_-_changes_to_pu_elements.pdf"
      },
      {
        "number": "12",
        "driver": "Kimi Antonelli",
        "event": "Italian Grand Prix",
        "session": "Free Practice 1",
        "decision": "Drop of 30 grid positions for the next Race in which the driver participates.",
        "elements": [
          "5th Engine (ICE)",
          "4th Energy Store (ES)",
          "4th Control Electronics Unit (PU-CE)"
        ],
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_12_-_changes_to_pu_elements.pdf"
      }
    ],
    "sources": [
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_pu_elements_used_per_driver_up_to_now.pdf",
        "title": "Doc 9 - PU Elements used per Driver up to now",
        "published": "11.09.26 09:50"
      },
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_new_pu_elements_for_this_competition.pdf",
        "title": "Doc 30 - New PU elements for this Competition",
        "published": "12.09.26 12:48"
      },
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_infringement_-_car_18_-_pu_elements_changed.pdf",
        "title": "Doc 41 - Infringement - Car 18 - PU Elements changed",
        "published": "12.09.26 16:56"
      },
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_14_-_pu_elements_changed_during_parc_ferme.pdf",
        "title": "Doc 56 - Infringement - Car 14 - PU elements changed during Parc Ferme",
        "published": "06.09.26 12:54"
      },
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_30_-_change_to_pu_elements.pdf",
        "title": "Doc 41 - Infringement - Car 30 - Change to PU elements",
        "published": "05.09.26 17:02"
      },
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_23_-_changes_to_pu_elements.pdf",
        "title": "Doc 20 - Infringement - Car 23 - Changes to PU elements",
        "published": "04.09.26 17:11"
      },
      {
        "url": "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_infringement_-_car_12_-_changes_to_pu_elements.pdf",
        "title": "Doc 19 - Infringement - Car 12 - Changes to PU elements",
        "published": "04.09.26 17:10"
      }
    ]
  },
};
