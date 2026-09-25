import DemoEntryButton from "@/components/demo-entry-button";
import IntakeForm from "@/components/intake-form";

function SparkMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 3.75 28.25 16 16 28.25 3.75 16 16 3.75Z" fill="currentColor" />
        <path d="M16 9v14M9 16h14" stroke="#F7F6F0" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function QueuePreview() {
  return (
    <div className="preview-shell" aria-hidden="true">
      <div className="preview-topline">
        <span className="preview-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>COMMONLINE / INBOX</span>
        <span className="preview-live"><i /> DEMO</span>
      </div>
      <div className="preview-content">
        <div className="preview-heading">
          <div>
            <p className="eyebrow eyebrow-light">SAMPLE WORKSPACE</p>
            <h2>A clear view, team.</h2>
          </div>
          <span className="preview-avatar" aria-hidden="true">CL</span>
        </div>
        <div className="preview-stats">
          <div><strong>08</strong><span>open requests</span></div>
          <div><strong>03</strong><span>need a hand</span></div>
          <div><strong>01</strong><span>new today</span></div>
        </div>
        <div className="preview-list-label"><span>UP NEXT</span><span>VIEW INBOX ↗</span></div>
        <div className="preview-row">
          <span className="preview-icon preview-icon-mint" aria-hidden="true">⌂</span>
          <span className="preview-row-copy"><strong>Heating system check</strong><small>Fictional web intake</small></span>
          <span className="preview-status">NEW</span>
        </div>
        <div className="preview-row">
          <span className="preview-icon preview-icon-peach" aria-hidden="true">↗</span>
          <span className="preview-row-copy"><strong>Kitchen tap installation</strong><small>Fictional partner request</small></span>
          <span className="preview-status preview-status-assigned">MAYA</span>
        </div>
      </div>
      <div className="preview-caption"><span className="caption-line" /> A tiny, fictional service desk—ready to explore.</div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="public-page">
      <header className="site-header page-frame">
        <a className="brand-lockup" href="#top" aria-label="Commonline Service Desk home">
          <SparkMark />
          <span><strong>COMMONLINE</strong><small>SERVICE DESK</small></span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <DemoEntryButton className="button button-dark button-small" />
        </nav>
      </header>

      <section className="hero-section page-frame" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-rule" /> A SMALL SERVICE TEAM, IN SYNC</p>
          <h1>Every request deserves <em>a good start.</em></h1>
          <p className="hero-description">A clear path from “we need a hand” to “all taken care of.” Explore a thoughtfully simple intake desk, made for the people keeping things moving.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#intake">Send a sample request <span aria-hidden="true">↘</span></a>
            <span className="hero-note"><span className="note-dot" /> Fictional data, real workflow</span>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars" aria-hidden="true"><span>MC</span><span>JL</span><span>AR</span></div>
            <span>Made for small teams<br /><strong>who care about the follow-through.</strong></span>
          </div>
        </div>
        <div className="hero-art"><QueuePreview /></div>
      </section>

      <section className="intake-section page-frame" id="intake">
        <div className="section-intro">
          <p className="eyebrow"><span className="eyebrow-rule" /> START WITH THE DETAILS</p>
          <h2>Tell us what needs<br /><em>taking care of.</em></h2>
          <p>Use a fictional example or make one up. This public demo is for synthetic requests in your own temporary workspace.</p>
          <div className="privacy-note"><span className="privacy-icon" aria-hidden="true">✳</span><span><strong>No real messages are sent.</strong><br />Your request stays inside this demo.</span></div>
          <div className="step-ribbon" id="how-it-works">
            <span className="step-number">01</span><span><strong>Share the request</strong><small>Start with the essentials</small></span>
            <span className="step-arrow" aria-hidden="true">→</span>
            <span className="step-number">02</span><span><strong>See it through</strong><small>Try the staff workspace</small></span>
          </div>
        </div>
        <div className="intake-card">
          <div className="card-header">
            <div><p className="eyebrow eyebrow-muted">PUBLIC INTAKE</p><h3>New service request</h3></div>
            <span className="form-step">1 <i>/</i> 2</span>
          </div>
          <IntakeForm />
        </div>
      </section>

      <footer className="site-footer page-frame">
        <a className="brand-lockup brand-lockup-small" href="#top"><SparkMark /><span><strong>COMMONLINE</strong><small>SERVICE DESK</small></span></a>
        <p>Portfolio demo · synthetic data only · no real customer systems</p>
        <a className="footer-top" href="#top">BACK TO TOP ↑</a>
      </footer>
    </main>
  );
}
