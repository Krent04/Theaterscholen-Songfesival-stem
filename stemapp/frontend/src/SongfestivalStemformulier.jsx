import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "./songfestival-frontend.css";

const SONGFESTIVAL_PUNTEN = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const alleScholen = [
  "Antwerpen", "Arnhem", "ATKA", "Brussel", "Den Bosch", "Filmacademie",
  "Gent", "Leuven", "Maastricht", "Rotterdam", "Tilburg", "Utrecht"
];

// Vlaggen mapping: schoolnaam → afbeelding pad
const vlaggen = {
  "Antwerpen": "/flags/antwerpen.png",
  "Arnhem": "/flags/arnhem.png",
  "ATKA": "/flags/atka.png",
  "Brussel": "/flags/brussel.png",
  "Den Bosch": "/flags/denbosch.png",
  "Filmacademie": "/flags/filmacademie.png",
  "Gent": "/flags/gent.png",
  "Leuven": "/flags/leuven.png",
  "Maastricht": "/flags/maastricht.png",
  "Rotterdam": "/flags/rotterdam.png",
  "Tilburg": "/flags/tilburg.png",
  "Utrecht": "/flags/utrecht.png",
};

export default function SongfestivalStemformulier() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [eigenSchool, setEigenSchool] = useState(null);
  const [schoolLijst, setSchoolLijst] = useState([]);
  const [response, setResponse] = useState("");
  const [step, setStep] = useState("email"); // email → verify → drag → done

  // Stap 1: E-mailadres checken en code versturen
  async function handleEmailCheck(e) {
    e.preventDefault();
    const val = email.trim();
    if (!val) return;
    setResponse("");
    const resp = await fetch("http://192.168.1.212:4000/check-email", {  // <-- CORRECTIE HIER
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: val })
    });
    const data = await resp.json();
    if (data.verifyStep) {
      setStep("verify");
      setResponse("Er is een verificatiecode naar je e-mail gestuurd.");
    } else {
      setResponse(data.message || "Onbekend e-mailadres.");
    }
  }

  // Stap 2: Verificatiecode controleren
  async function handleCodeVerify(e) {
    e.preventDefault();
    setResponse("");
    const resp = await fetch("http://192.168.1.212:4000/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    const data = await resp.json();
    if (data.verified && data.school) {
      setEigenSchool(data.school);
      setSchoolLijst(alleScholen.filter(s => s !== data.school));
      setStep("drag");
      setResponse("");
    } else {
      setResponse(data.message || "Verificatiecode onjuist.");
    }
  }

  function handleDragEnd(result) {
    if (!result.destination) return;
    const items = Array.from(schoolLijst);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    setSchoolLijst(items);
  }

  // Stap 3: Stem indienen
  async function handleSubmit(e) {
    e.preventDefault();
    let puntenVerdeling = {};
    schoolLijst.forEach((school, idx) => {
      puntenVerdeling[school] = SONGFESTIVAL_PUNTEN[idx] ?? 0;
    });
    const resp = await fetch("http://192.168.1.212:4000/vote", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email, puntenVerdeling})
    });
    const data = await resp.json();
    setResponse(data.message || "Er ging iets mis.");
    if (data.message && data.message.includes("succes")) {
      setStep("done");
    }
  }

  return (
    <div className="stemformulier-container">
      <h1>Breng je stem uit!</h1>

      {step === "email" && (
        <form onSubmit={handleEmailCheck}>
          <label>
            E-mailadres:<br />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <button type="submit" style={{marginLeft: "10px"}}>E-mail checken</button>
          <br /><br />
        </form>
      )}

      {step === "verify" && (
        <form onSubmit={handleCodeVerify}>
          <label>
            Vul de verificatiecode uit je e-mail in:<br />
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoFocus
              required
              style={{letterSpacing: "0.2em", fontSize: "1.1em"}}
            />
          </label>
          <button type="submit" style={{marginLeft: "10px"}}>Verifiëren</button>
          <br /><br />
          <button type="button" onClick={() => setStep("email")}>← Terug</button>
        </form>
      )}

      {step === "drag" && (
        <form onSubmit={handleSubmit}>
          <p>Sleept de scholen in volgorde van jouw voorkeur (bovenaan = hoogste punten):</p>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="scholen">
              {(provided) => (
                <div
                  className="jury-punten-list"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {schoolLijst.map((school, idx) => (
                    <Draggable key={school} draggableId={school} index={idx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`schoolblok${snapshot.isDragging ? " dragging" : ""}`}
                        >
                          <img
                            className="schoolblok-flag"
                            src={vlaggen[school]}
                            alt={school + " vlag"}
                          />
                          <span className="schoolblok-name">{school}</span>
                          <span
                            className={`schoolblok-points${idx === 0 ? " winner" : ""}`}
                          >
                            {SONGFESTIVAL_PUNTEN[idx] ?? 0}
                          </span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <button type="submit" style={{marginTop: "16px"}}>Stem!</button>
        </form>
      )}

      {step === "done" && (
        <p><strong>Bedankt voor je stem!</strong></p>
      )}

      <div id="response">{response}</div>
    </div>
  );
}