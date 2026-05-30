import { useState } from "react";
import { api } from "./api.js";
import AgentView from "./components/AgentView.jsx";
import Intake from "./components/Intake.jsx";
import Entities from "./components/Entities.jsx";
import GmailConnect from "./components/GmailConnect.jsx";
import Synthesis from "./components/Synthesis.jsx";
import Recommendation from "./components/Recommendation.jsx";
import DocumentPack from "./components/DocumentPack.jsx";

// Which AgentView animation to show while a given stage runs.
const AGENT_STAGE = {
  1: "extracting",
  2: "extracting",
  3: "searching",
  4: "synthesising",
  5: "recommending",
  6: "packing",
};

export default function App() {
  const [caseId, setCaseId] = useState(null);
  const [step, setStep] = useState(0); // number of completed stages
  const [busy, setBusy] = useState(null); // index of the stage currently running
  const [data, setData] = useState({}); // results keyed by stage index

  // Run one stage: show its agent animation, call the API, store the result,
  // and advance the pipeline so the next stage unlocks.
  async function run(index, call) {
    setBusy(index);
    try {
      const result = await call();
      setData((d) => ({ ...d, [index]: result }));
      setStep((s) => Math.max(s, index));
      return result;
    } catch (err) {
      alert(`Stage ${index} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  const agentStage = busy ? AGENT_STAGE[busy] : "idle";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="font-pixel text-xl text-indigo-300">CasePilot</h1>
        <p className="mt-3 text-sm text-gray-400">
          Dump your legal problem. The agents do the investigative legwork and tell you,
          honestly, whether it's worth pursuing.
        </p>
      </header>

      <div className="mb-6">
        <AgentView stage={agentStage} />
      </div>

      <div className="space-y-5">
        <Intake
          loading={busy === 1}
          done={step >= 1}
          summary={data[1]?.summary}
          onWorking={(on) => setBusy(on ? 1 : null)}
          onComplete={({ case_id, summary }) => {
            setCaseId(case_id);
            setData((d) => ({ ...d, 1: { summary } }));
            setStep((s) => Math.max(s, 1));
          }}
        />

        <Entities
          locked={step < 1}
          loading={busy === 2}
          done={step >= 2}
          data={data[2]}
          onRun={() => run(2, () => api.extractEntities(caseId))}
        />

        <GmailConnect
          locked={step < 2}
          loading={busy === 3}
          done={step >= 3}
          data={data[3]}
          caseId={caseId}
          onWorking={(on) => setBusy(on ? 3 : null)}
          onComplete={(res) => {
            setData((d) => ({ ...d, 3: res }));
            setStep((s) => Math.max(s, 3));
          }}
        />

        <Synthesis
          locked={step < 3}
          loading={busy === 4}
          done={step >= 4}
          data={data[4]}
          onRun={() => run(4, () => api.synthesize(caseId))}
        />

        <Recommendation
          locked={step < 4}
          loading={busy === 5}
          done={step >= 5}
          data={data[5]}
          onRun={() => run(5, () => api.recommend(caseId))}
        />

        <DocumentPack
          locked={step < 5}
          loading={busy === 6}
          done={step >= 6}
          data={data[6]}
          onRun={() => run(6, () => api.generatePack(caseId))}
        />
      </div>

      <footer className="mt-10 text-center text-xs text-gray-600">
        Mock skeleton · case_id: {caseId || "—"}
      </footer>
    </div>
  );
}
