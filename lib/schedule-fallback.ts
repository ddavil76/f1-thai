// สแนปช็อตปฏิทิน 2026 — ใช้เป็น fallback เมื่อ Jolpica ล่ม (อัปเดตต้นฤดูกาลใหม่)
import type { Race } from "./f1";

export const SCHEDULE_FALLBACK: Record<string, Race[]> = {
  "2026": [
    {
      "season": "2026",
      "round": "1",
      "raceName": "Australian Grand Prix",
      "date": "2026-03-08",
      "time": "04:00:00Z",
      "Circuit": {
        "circuitId": "albert_park",
        "circuitName": "Albert Park Grand Prix Circuit",
        "url": "https://en.wikipedia.org/wiki/Albert_Park_Circuit",
        "Location": {
          "locality": "Melbourne",
          "country": "Australia",
          "lat": "-37.8497",
          "long": "144.968"
        }
      },
      "FirstPractice": {
        "date": "2026-03-06",
        "time": "01:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-03-06",
        "time": "05:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-03-07",
        "time": "01:30:00Z"
      },
      "Qualifying": {
        "date": "2026-03-07",
        "time": "05:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "2",
      "raceName": "Chinese Grand Prix",
      "date": "2026-03-15",
      "time": "07:00:00Z",
      "Circuit": {
        "circuitId": "shanghai",
        "circuitName": "Shanghai International Circuit",
        "url": "https://en.wikipedia.org/wiki/Shanghai_International_Circuit",
        "Location": {
          "locality": "Shanghai",
          "country": "China",
          "lat": "31.3389",
          "long": "121.22"
        }
      },
      "FirstPractice": {
        "date": "2026-03-13",
        "time": "03:30:00Z"
      },
      "Qualifying": {
        "date": "2026-03-14",
        "time": "07:00:00Z"
      },
      "Sprint": {
        "date": "2026-03-14",
        "time": "03:00:00Z"
      },
      "SprintQualifying": {
        "date": "2026-03-13",
        "time": "07:30:00Z"
      }
    },
    {
      "season": "2026",
      "round": "3",
      "raceName": "Japanese Grand Prix",
      "date": "2026-03-29",
      "time": "05:00:00Z",
      "Circuit": {
        "circuitId": "suzuka",
        "circuitName": "Suzuka Circuit",
        "url": "https://en.wikipedia.org/wiki/Suzuka_International_Racing_Course",
        "Location": {
          "locality": "Suzuka",
          "country": "Japan",
          "lat": "34.8431",
          "long": "136.541"
        }
      },
      "FirstPractice": {
        "date": "2026-03-27",
        "time": "02:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-03-27",
        "time": "06:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-03-28",
        "time": "02:30:00Z"
      },
      "Qualifying": {
        "date": "2026-03-28",
        "time": "06:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "4",
      "raceName": "Miami Grand Prix",
      "date": "2026-05-03",
      "time": "20:00:00Z",
      "Circuit": {
        "circuitId": "miami",
        "circuitName": "Miami International Autodrome",
        "url": "https://en.wikipedia.org/wiki/Miami_International_Autodrome",
        "Location": {
          "locality": "Miami",
          "country": "USA",
          "lat": "25.9581",
          "long": "-80.2389"
        }
      },
      "FirstPractice": {
        "date": "2026-05-01",
        "time": "16:00:00Z"
      },
      "Qualifying": {
        "date": "2026-05-02",
        "time": "20:00:00Z"
      },
      "Sprint": {
        "date": "2026-05-02",
        "time": "16:00:00Z"
      },
      "SprintQualifying": {
        "date": "2026-05-01",
        "time": "20:30:00Z"
      }
    },
    {
      "season": "2026",
      "round": "5",
      "raceName": "Canadian Grand Prix",
      "date": "2026-05-24",
      "time": "20:00:00Z",
      "Circuit": {
        "circuitId": "villeneuve",
        "circuitName": "Circuit Gilles Villeneuve",
        "url": "https://en.wikipedia.org/wiki/Circuit_Gilles_Villeneuve",
        "Location": {
          "locality": "Montreal",
          "country": "Canada",
          "lat": "45.5",
          "long": "-73.5228"
        }
      },
      "FirstPractice": {
        "date": "2026-05-22",
        "time": "16:30:00Z"
      },
      "Qualifying": {
        "date": "2026-05-23",
        "time": "20:00:00Z"
      },
      "Sprint": {
        "date": "2026-05-23",
        "time": "16:00:00Z"
      },
      "SprintQualifying": {
        "date": "2026-05-22",
        "time": "20:30:00Z"
      }
    },
    {
      "season": "2026",
      "round": "6",
      "raceName": "Monaco Grand Prix",
      "date": "2026-06-07",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "monaco",
        "circuitName": "Circuit de Monaco",
        "url": "https://en.wikipedia.org/wiki/Circuit_de_Monaco",
        "Location": {
          "locality": "Monte Carlo",
          "country": "Monaco",
          "lat": "43.7347",
          "long": "7.42056"
        }
      },
      "FirstPractice": {
        "date": "2026-06-05",
        "time": "11:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-06-05",
        "time": "15:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-06-06",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-06-06",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "7",
      "raceName": "Barcelona Grand Prix",
      "date": "2026-06-14",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "catalunya",
        "circuitName": "Circuit de Barcelona-Catalunya",
        "url": "https://en.wikipedia.org/wiki/Circuit_de_Barcelona-Catalunya",
        "Location": {
          "locality": "Barcelona",
          "country": "Spain",
          "lat": "41.57",
          "long": "2.26111"
        }
      },
      "FirstPractice": {
        "date": "2026-06-12",
        "time": "11:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-06-12",
        "time": "15:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-06-13",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-06-13",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "8",
      "raceName": "Austrian Grand Prix",
      "date": "2026-06-28",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "red_bull_ring",
        "circuitName": "Red Bull Ring",
        "url": "https://en.wikipedia.org/wiki/Red_Bull_Ring",
        "Location": {
          "locality": "Spielberg",
          "country": "Austria",
          "lat": "47.2197",
          "long": "14.7647"
        }
      },
      "FirstPractice": {
        "date": "2026-06-26",
        "time": "11:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-06-26",
        "time": "15:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-06-27",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-06-27",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "9",
      "raceName": "British Grand Prix",
      "date": "2026-07-05",
      "time": "14:00:00Z",
      "Circuit": {
        "circuitId": "silverstone",
        "circuitName": "Silverstone Circuit",
        "url": "https://en.wikipedia.org/wiki/Silverstone_Circuit",
        "Location": {
          "locality": "Silverstone",
          "country": "UK",
          "lat": "52.0786",
          "long": "-1.01694"
        }
      },
      "FirstPractice": {
        "date": "2026-07-03",
        "time": "11:30:00Z"
      },
      "Qualifying": {
        "date": "2026-07-04",
        "time": "15:00:00Z"
      },
      "Sprint": {
        "date": "2026-07-04",
        "time": "11:00:00Z"
      },
      "SprintQualifying": {
        "date": "2026-07-03",
        "time": "15:30:00Z"
      }
    },
    {
      "season": "2026",
      "round": "10",
      "raceName": "Belgian Grand Prix",
      "date": "2026-07-19",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "spa",
        "circuitName": "Circuit de Spa-Francorchamps",
        "url": "https://en.wikipedia.org/wiki/Circuit_de_Spa-Francorchamps",
        "Location": {
          "locality": "Spa",
          "country": "Belgium",
          "lat": "50.4372",
          "long": "5.97139"
        }
      },
      "FirstPractice": {
        "date": "2026-07-17",
        "time": "11:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-07-17",
        "time": "15:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-07-18",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-07-18",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "11",
      "raceName": "Hungarian Grand Prix",
      "date": "2026-07-26",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "hungaroring",
        "circuitName": "Hungaroring",
        "url": "https://en.wikipedia.org/wiki/Hungaroring",
        "Location": {
          "locality": "Budapest",
          "country": "Hungary",
          "lat": "47.5789",
          "long": "19.2486"
        }
      },
      "FirstPractice": {
        "date": "2026-07-24",
        "time": "11:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-07-24",
        "time": "15:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-07-25",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-07-25",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "12",
      "raceName": "Dutch Grand Prix",
      "date": "2026-08-23",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "zandvoort",
        "circuitName": "Circuit Park Zandvoort",
        "url": "https://en.wikipedia.org/wiki/Circuit_Zandvoort",
        "Location": {
          "locality": "Zandvoort",
          "country": "Netherlands",
          "lat": "52.3888",
          "long": "4.54092"
        }
      },
      "FirstPractice": {
        "date": "2026-08-21",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-08-22",
        "time": "14:00:00Z"
      },
      "Sprint": {
        "date": "2026-08-22",
        "time": "10:00:00Z"
      },
      "SprintQualifying": {
        "date": "2026-08-21",
        "time": "14:30:00Z"
      }
    },
    {
      "season": "2026",
      "round": "13",
      "raceName": "Italian Grand Prix",
      "date": "2026-09-06",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "monza",
        "circuitName": "Autodromo Nazionale di Monza",
        "url": "https://en.wikipedia.org/wiki/Monza_Circuit",
        "Location": {
          "locality": "Monza",
          "country": "Italy",
          "lat": "45.6156",
          "long": "9.28111"
        }
      },
      "FirstPractice": {
        "date": "2026-09-04",
        "time": "10:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-09-04",
        "time": "14:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-09-05",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-09-05",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "14",
      "raceName": "Spanish Grand Prix",
      "date": "2026-09-13",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "madring",
        "circuitName": "Madring",
        "url": "https://en.wikipedia.org/wiki/Madring",
        "Location": {
          "locality": "Madrid",
          "country": "Spain",
          "lat": "40.46528",
          "long": "-3.61528"
        }
      },
      "FirstPractice": {
        "date": "2026-09-11",
        "time": "11:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-09-11",
        "time": "15:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-09-12",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-09-12",
        "time": "14:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "15",
      "raceName": "Azerbaijan Grand Prix",
      "date": "2026-09-26",
      "time": "11:00:00Z",
      "Circuit": {
        "circuitId": "baku",
        "circuitName": "Baku City Circuit",
        "url": "https://en.wikipedia.org/wiki/Baku_City_Circuit",
        "Location": {
          "locality": "Baku",
          "country": "Azerbaijan",
          "lat": "40.3725",
          "long": "49.8533"
        }
      },
      "FirstPractice": {
        "date": "2026-09-24",
        "time": "08:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-09-24",
        "time": "12:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-09-25",
        "time": "08:30:00Z"
      },
      "Qualifying": {
        "date": "2026-09-25",
        "time": "12:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "16",
      "raceName": "Bahrain Grand Prix in Malaysia",
      "date": "2026-10-04",
      "time": "07:00:00Z",
      "Circuit": {
        "circuitId": "sepang",
        "circuitName": "Sepang International Circuit",
        "url": "https://en.wikipedia.org/wiki/Sepang_International_Circuit",
        "Location": {
          "locality": "Kuala Lumpur",
          "country": "Malaysia",
          "lat": "2.76083",
          "long": "101.738"
        }
      },
      "FirstPractice": {
        "date": "2026-10-02",
        "time": "04:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-10-02",
        "time": "08:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-10-03",
        "time": "04:30:00Z"
      },
      "Qualifying": {
        "date": "2026-10-03",
        "time": "08:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "17",
      "raceName": "Singapore Grand Prix",
      "date": "2026-10-11",
      "time": "12:00:00Z",
      "Circuit": {
        "circuitId": "marina_bay",
        "circuitName": "Marina Bay Street Circuit",
        "url": "https://en.wikipedia.org/wiki/Marina_Bay_Street_Circuit",
        "Location": {
          "locality": "Marina Bay",
          "country": "Singapore",
          "lat": "1.2914",
          "long": "103.864"
        }
      },
      "FirstPractice": {
        "date": "2026-10-09",
        "time": "08:30:00Z"
      },
      "Qualifying": {
        "date": "2026-10-10",
        "time": "13:00:00Z"
      },
      "Sprint": {
        "date": "2026-10-10",
        "time": "09:00:00Z"
      },
      "SprintQualifying": {
        "date": "2026-10-09",
        "time": "12:30:00Z"
      }
    },
    {
      "season": "2026",
      "round": "18",
      "raceName": "United States Grand Prix",
      "date": "2026-10-25",
      "time": "20:00:00Z",
      "Circuit": {
        "circuitId": "americas",
        "circuitName": "Circuit of the Americas",
        "url": "https://en.wikipedia.org/wiki/Circuit_of_the_Americas",
        "Location": {
          "locality": "Austin",
          "country": "USA",
          "lat": "30.1328",
          "long": "-97.6411"
        }
      },
      "FirstPractice": {
        "date": "2026-10-23",
        "time": "17:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-10-23",
        "time": "21:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-10-24",
        "time": "17:30:00Z"
      },
      "Qualifying": {
        "date": "2026-10-24",
        "time": "21:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "19",
      "raceName": "Mexico City Grand Prix",
      "date": "2026-11-01",
      "time": "20:00:00Z",
      "Circuit": {
        "circuitId": "rodriguez",
        "circuitName": "Autódromo Hermanos Rodríguez",
        "url": "https://en.wikipedia.org/wiki/Aut%C3%B3dromo_Hermanos_Rodr%C3%ADguez",
        "Location": {
          "locality": "Mexico City",
          "country": "Mexico",
          "lat": "19.4042",
          "long": "-99.0907"
        }
      },
      "FirstPractice": {
        "date": "2026-10-30",
        "time": "18:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-10-30",
        "time": "22:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-10-31",
        "time": "17:30:00Z"
      },
      "Qualifying": {
        "date": "2026-10-31",
        "time": "21:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "20",
      "raceName": "Brazilian Grand Prix",
      "date": "2026-11-08",
      "time": "17:00:00Z",
      "Circuit": {
        "circuitId": "interlagos",
        "circuitName": "Autódromo José Carlos Pace",
        "url": "https://en.wikipedia.org/wiki/Interlagos_Circuit",
        "Location": {
          "locality": "São Paulo",
          "country": "Brazil",
          "lat": "-23.7036",
          "long": "-46.6997"
        }
      },
      "FirstPractice": {
        "date": "2026-11-06",
        "time": "15:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-11-06",
        "time": "19:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-11-07",
        "time": "14:30:00Z"
      },
      "Qualifying": {
        "date": "2026-11-07",
        "time": "18:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "21",
      "raceName": "Las Vegas Grand Prix",
      "date": "2026-11-22",
      "time": "04:00:00Z",
      "Circuit": {
        "circuitId": "vegas",
        "circuitName": "Las Vegas Strip Street Circuit",
        "url": "https://en.wikipedia.org/wiki/Las_Vegas_Grand_Prix#Circuit",
        "Location": {
          "locality": "Las Vegas",
          "country": "USA",
          "lat": "36.1147",
          "long": "-115.173"
        }
      },
      "FirstPractice": {
        "date": "2026-11-20",
        "time": "00:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-11-20",
        "time": "04:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-11-21",
        "time": "00:30:00Z"
      },
      "Qualifying": {
        "date": "2026-11-21",
        "time": "04:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "22",
      "raceName": "Qatar Grand Prix",
      "date": "2026-11-29",
      "time": "16:00:00Z",
      "Circuit": {
        "circuitId": "losail",
        "circuitName": "Losail International Circuit",
        "url": "https://en.wikipedia.org/wiki/Lusail_International_Circuit",
        "Location": {
          "locality": "Lusail",
          "country": "Qatar",
          "lat": "25.49",
          "long": "51.4542"
        }
      },
      "FirstPractice": {
        "date": "2026-11-27",
        "time": "13:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-11-27",
        "time": "17:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-11-28",
        "time": "14:30:00Z"
      },
      "Qualifying": {
        "date": "2026-11-28",
        "time": "18:00:00Z"
      }
    },
    {
      "season": "2026",
      "round": "23",
      "raceName": "Abu Dhabi Grand Prix",
      "date": "2026-12-06",
      "time": "13:00:00Z",
      "Circuit": {
        "circuitId": "yas_marina",
        "circuitName": "Yas Marina Circuit",
        "url": "https://en.wikipedia.org/wiki/Yas_Marina_Circuit",
        "Location": {
          "locality": "Abu Dhabi",
          "country": "UAE",
          "lat": "24.4672",
          "long": "54.6031"
        }
      },
      "FirstPractice": {
        "date": "2026-12-04",
        "time": "09:30:00Z"
      },
      "SecondPractice": {
        "date": "2026-12-04",
        "time": "13:00:00Z"
      },
      "ThirdPractice": {
        "date": "2026-12-05",
        "time": "10:30:00Z"
      },
      "Qualifying": {
        "date": "2026-12-05",
        "time": "14:00:00Z"
      }
    }
  ],
};
