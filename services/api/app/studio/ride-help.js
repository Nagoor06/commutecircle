export function enableRideHelp(token) {
  const el = id => document.getElementById(id);
  const guide = el('help-source').href;
  el('ride-help').hidden = false;
  el('help-form').onsubmit = async event => {
    event.preventDefault();
    const question = el('help-question').value.trim();
    if (!question) return;
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    el('help-answer').textContent = 'Checking the rider guide…';
    el('help-source').href = guide;
    el('help-source').textContent = 'Read the rider guide';
    try {
      const response = await fetch('/v1/help/ask', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
        body: JSON.stringify({question}),
        signal: AbortSignal.timeout(145000)
      });
      if (response.status === 429) {
        el('help-answer').textContent = 'Ride help is busy. Try again shortly.';
        return;
      }
      if (!response.ok) throw Error();
      const result = await response.json();
      el('help-answer').textContent = result.answer;
      const citation = result.sources[0];
      if (citation) {
        el('help-source').href = citation.url;
        el('help-source').textContent = citation.title;
      }
    } catch {
      el('help-answer').textContent = 'Ride help is unavailable. You can still read the guide.';
    } finally {
      button.disabled = false;
    }
  };
}
