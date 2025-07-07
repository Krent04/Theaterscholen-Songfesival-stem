const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer"); // <-- Toegevoegd voor e-mailverificatie

const SCHOLEN = [
  "Antwerpen", "Arnhem", "ATKA", "Brussel", "Den Bosch", "Filmacademie",
  "Gent", "Leuven", "Maastricht", "Rotterdam", "Tilburg", "Utrecht"
];
const SONGFESTIVAL_PUNTEN = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];

// Mapping: schoolnaam => array van domeinen
const SCHOOL_DOMEINEN = {
  "Antwerpen": ["ap.be", "uantwerpen.be"],
  "Arnhem": ["student.artez.nl", "artez.nl", "gmail.com"],
  "ATKA": ["ahk.nl", "icloud.com"],
  "Brussel": ["ehb.be", "vub.be", "odisee.be"],
  "Den Bosch": ["avans.nl"],
  "Filmacademie": ["ahk.nl", "planet.nl"],
  "Gent": ["hogent.be"],
  "Leuven": ["kuleuven.be"],
  "Maastricht": ["zuyd.nl", "maastrichtuniversity.nl"],
  "Rotterdam": ["hr.nl", "codarts.nl"],
  "Tilburg": ["fontys.nl", "uvt.nl"],
  "Utrecht": ["hu.nl", "student.uu.nl"]
};

// Genereer een lijst van alle toegestane domeinen (voor validatie)
const TOEGESTAAN_DOMEINEN = Object.values(SCHOOL_DOMEINEN).flat();

function schoolVanEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return { naam: null };
  const emailDomein = email.split("@")[1].toLowerCase();

  // Vind bijpassende school op basis van domein (mag subdomeinen zijn)
  for (const [school, domeinen] of Object.entries(SCHOOL_DOMEINEN)) {
    if (domeinen.some(dom => emailDomein.endsWith(dom))) {
      return { naam: school };
    }
  }
  return { naam: null };
}

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json());

const stemmenVanSchool = {};

// === E-MAIL VERIFICATIE SECTION ===

// Tijdelijke opslag van verificatiecodes: { email: { code, expires } }
const verificationCodes = {};

// Zet hier je SMTP-gegevens in
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // bijv. "smtp.gmail.com"
  port: 587,
  secure: false,
  auth: {
    user: "theaterscholensongfestival@gmail.com",
    pass: "vfjvdlyonrgmkxxe"
  }
});

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-cijferige code
}

// 1. Aanvraag: e-mail checken + verificatiecode sturen
app.post("/check-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ message: "Geen e-mailadres opgegeven." });

  const emailDomein = email.split("@")[1]?.toLowerCase();
  if (!TOEGESTAAN_DOMEINEN.some(dom => emailDomein.endsWith(dom))) {
    return res.json({ message: "Alleen e-mailadressen van deelnemende scholen zijn toegestaan." });
  }

  const school = schoolVanEmail(email);
  if (!school.naam) {
    return res.json({ message: "E-mailadres hoort niet bij een bekende school." });
  }

  // Genereer code en bewaar tijdelijk (5 min geldig)
  const code = generateVerificationCode();
  verificationCodes[email.toLowerCase()] = {
    code,
    expires: Date.now() + 5 * 60 * 1000 // 5 minuten geldig
  };

  // Stuur de code per e-mail naar de gebruiker
  try {
    await transporter.sendMail({
      from: '"Songfestival" <theaterscholensongfestival@gmail.com>', // Afzender
      to: email,
      subject: "Jouw Songfestival verificatiecode",
      text: `Je Songfestival-verificatiecode is: ${code}`,
      html: `<p>Je Songfestival-verificatiecode is: <b>${code}</b></p>`
    });
    res.json({ message: "Er is een verificatiecode naar je e-mail gestuurd.", verifyStep: true });
  } catch (err) {
    res.json({ message: "Kon geen e-mail verzenden. Neem contact op met de organisatie." });
  }
});

// 2. Verificatiecode controleren
app.post("/verify-code", (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.json({ message: "E-mail en code zijn verplicht." });
  const entry = verificationCodes[email?.toLowerCase()];
  if (!entry) {
    return res.json({ message: "Geen code aangevraagd voor dit e-mailadres." });
  }
  if (Date.now() > entry.expires) {
    delete verificationCodes[email?.toLowerCase()];
    return res.json({ message: "De code is verlopen, vraag een nieuwe aan." });
  }
  if (entry.code !== code) {
    return res.json({ message: "Verificatiecode klopt niet." });
  }
  // Verificatie gelukt, code verwijderen
  delete verificationCodes[email?.toLowerCase()];
  // Vanaf nu mag deze gebruiker stemmen (in je frontend kun je dit bijhouden)
  res.json({ message: "E-mailadres geverifieerd!", verified: true, school: schoolVanEmail(email).naam });
});

// === EINDE E-MAIL VERIFICATIE SECTION ===

// Let op: je moet nu in de frontend de verificatie afronden vóór je mag stemmen!

app.post("/vote", (req, res) => {
  const { email, puntenVerdeling } = req.body;
  if (!email || !puntenVerdeling) {
    return res.json({ message: "Email en puntenVerdeling zijn verplicht." });
  }
  // Eventueel kun je hier (optioneel) nog checken of het e-mailadres recent geverifieerd is.
  const schoolObj = schoolVanEmail(email);
  if (!schoolObj.naam) {
    return res.json({ message: "School niet herkend op basis van e-mailadres." });
  }
  const stemmendeSchool = schoolObj.naam;

  if (Object.keys(puntenVerdeling).includes(stemmendeSchool)) {
    return res.json({ message: "Je mag niet op je eigen school stemmen!" });
  }
  const puntenArray = Object.values(puntenVerdeling).map(Number);
  if (
    puntenArray.length !== SONGFESTIVAL_PUNTEN.length ||
    !puntenArray.includes(0) ||
    !SONGFESTIVAL_PUNTEN.every(p => puntenArray.filter(x => x === p).length === 1)
  ) {
    return res.json({ message: `Punten moeten exact ${[...SONGFESTIVAL_PUNTEN].join(", ")} zijn, elk 1x gebruikt.` });
  }
  const expectedScholen = SCHOLEN.filter(s => s !== stemmendeSchool);
  if (
    Object.keys(puntenVerdeling).length !== expectedScholen.length ||
    !Object.keys(puntenVerdeling).every(s => expectedScholen.includes(s))
  ) {
    return res.json({ message: "Er is iets mis met de lijst van scholen waar je op stemt." });
  }

  if (!stemmenVanSchool[stemmendeSchool]) stemmenVanSchool[stemmendeSchool] = [];
  stemmenVanSchool[stemmendeSchool].push(puntenVerdeling);

  return res.json({ message: "Stem succesvol geregistreerd!" });
});

// Helper: bereken jury-uitslag per school op basis van gemiddelde
function berekenJuryUitslagGemiddelde(stemmenVanSchool, scholen, puntenLijst) {
  const juryUitslag = {};
  for (const school of scholen) {
    const stemmen = stemmenVanSchool[school] || [];
    if (stemmen.length === 0) continue;
    const andereScholen = scholen.filter(s => s !== school);
    const scores = {};
    for (const ontvanger of andereScholen) {
      const punten = stemmen.map(verdeling => Number(verdeling[ontvanger]) || 0);
      scores[ontvanger] = punten.length ? punten.reduce((a, b) => a + b, 0) / punten.length : 0;
    }
    const sorted = andereScholen.slice().sort((a, b) => scores[b] - scores[a]);
    const juryPunten = {};
    sorted.forEach((s, i) => {
      juryPunten[s] = puntenLijst[i] ?? 0;
    });
    juryUitslag[school] = juryPunten;
  }
  return juryUitslag;
}

// JSON API: Songfestival resultaten
app.get("/results", (req, res) => {
  const juryGemiddelde = berekenJuryUitslagGemiddelde(stemmenVanSchool, SCHOLEN, SONGFESTIVAL_PUNTEN);

  const totaal = {};
  for (const jurySchool in juryGemiddelde) {
    for (const [ontvanger, punten] of Object.entries(juryGemiddelde[jurySchool])) {
      totaal[ontvanger] = (totaal[ontvanger] || 0) + punten;
    }
  }

  const uitslag = Object.entries(totaal)
    .map(([school, punten]) => ({ school, punten }))
    .sort((a, b) => b.punten - a.punten);

  res.json({
    jury: juryGemiddelde,
    uitslag
  });
});

// HTML Songfestival Uitslagpagina (helder en leesbaar)
app.get("/uitslag", (req, res) => {
  const juryGemiddelde = berekenJuryUitslagGemiddelde(stemmenVanSchool, SCHOLEN, SONGFESTIVAL_PUNTEN);

  const totaal = {};
  for (const jurySchool in juryGemiddelde) {
    for (const [ontvanger, punten] of Object.entries(juryGemiddelde[jurySchool])) {
      totaal[ontvanger] = (totaal[ontvanger] || 0) + punten;
    }
  }
  const uitslag = Object.entries(totaal)
    .map(([school, punten]) => ({ school, punten }))
    .sort((a, b) => b.punten - a.punten);

  const juryHtml = Object.entries(juryGemiddelde).map(([school, puntenVerdeling]) => `
    <section class="jury-school">
      <h3>${school}</h3>
      <ul>
        ${
          Object.entries(puntenVerdeling)
            .sort((a, b) => b[1] - a[1])
            .map(([ontvanger, punten]) =>
              `<li><span>${ontvanger}</span><span class="punten">${punten}</span></li>`
            ).join("")
        }
      </ul>
    </section>
  `).join("");

  const eindUitslagHtml = uitslag.map(
    ({ school, punten }, idx) =>
      `<li${idx === 0 ? ' class="winnaar"' : ''}><span>${idx + 1}. ${school}</span><span class="punten">${punten}</span></li>`
  ).join("");

  const stijl = `
    <style>
      :root {
        --accent: #ffb700;
        --light-bg: #f7f7fa;
        --card-bg: #fff;
        --jury-bg: #f2f3fc;
        --jury-title: #363171;
        --main: #23214b;
        --punten-bg: #e4e2ff;
        --punten-clr: #363171;
      }
      body {
        background: var(--light-bg);
        color: var(--main);
        font-family: 'Segoe UI', Arial, sans-serif;
        margin: 0;
        font-size: 18px;
      }
      .container {
        max-width: 700px;
        margin: 40px auto;
        background: var(--card-bg);
        border-radius: 18px;
        box-shadow: 0 6px 32px #0001;
        padding: 2.5em 1.5em 2em 1.5em;
      }
      h1 {
        margin-top: 0;
        font-weight: 900;
        font-size: 2.2em;
        letter-spacing: 1px;
        color: var(--jury-title);
        text-align: center;
      }
      h2 {
        margin-top: 2.2em;
        font-size: 1.4em;
        letter-spacing: 1px;
        color: var(--accent);
        text-align: center;
      }
      .jury-lijst {
        margin: 2em 0 2.5em 0;
      }
      .jury-school {
        background: var(--jury-bg);
        border-radius: 13px;
        margin-bottom: 20px;
        padding: 18px 18px 8px 18px;
        box-shadow: 0 2px 8px #0001;
      }
      .jury-school h3 {
        margin: 0 0 0.5em 0;
        color: var(--jury-title);
        font-size: 1.05em;
        letter-spacing: 0.2px;
      }
      .jury-school ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .jury-school li {
        display: flex;
        justify-content: space-between;
        margin-bottom: 7px;
        font-size: 1em;
      }
      .punten {
        background: var(--punten-bg);
        color: var(--punten-clr);
        border-radius: 8px;
        padding: 2px 12px;
        font-weight: 600;
        margin-left: 1.2em;
        min-width: 2.2em;
        text-align: center;
        display: inline-block;
      }
      .einduitslag {
        background: linear-gradient(90deg,#fffbe6 0,#ffe5b3 100%);
        color: var(--main);
        border-radius: 13px;
        padding: 14px 16px 10px 16px;
        box-shadow: 0 2px 8px #0001;
        margin-top: 2em;
      }
      .einduitslag h2 {
        color: var(--accent);
        font-size: 1.3em;
        margin-bottom: 0.7em;
        text-align: center;
      }
      .einduitslag ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .einduitslag li {
        display: flex;
        justify-content: space-between;
        font-weight: 600;
        font-size: 1.08em;
        margin-bottom: 7px;
        align-items: center;
      }
      .einduitslag .winnaar {
        color: var(--accent);
        font-size: 1.25em;
        font-weight: 900;
        background: #fff6d0;
        border-radius: 6px;
        padding: 4px 0;
      }
      @media (max-width: 600px) {
        .container { padding: 1.3em 0.3em; }
        h1 { font-size: 1.18em; }
        h2 { font-size: 1em; }
        .jury-school { padding: 10px 6px 6px 8px; }
        .einduitslag { padding: 8px 4px; }
      }
    </style>
  `;

  res.send(`
    <!DOCTYPE html>
    <html lang="nl">
    <head>
      <meta charset="utf-8">
      <title>Songfestival Uitslag</title>
      ${stijl}
    </head>
    <body>
      <div class="container">
        <h1>Jury-uitslag per school</h1>
        <div class="jury-lijst">
          ${juryHtml || "<p style='text-align:center'>Er zijn nog geen stemmen!</p>"}
        </div>
        <div class="einduitslag">
          <h2>Einduitslag</h2>
          <ul>
            ${eindUitslagHtml || "<li>Er zijn nog geen stemmen!</li>"}
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0',() => {
  console.log(`Backend draait op http://0.0.0.0:${PORT}`);
});