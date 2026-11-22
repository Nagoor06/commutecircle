import {nativeReturn} from './native-return.js';

const back = nativeReturn(location.search);
if (back) {
  history.replaceState(null, '', location.pathname);
  const page = document.createElement('section');
  page.className = 'panel';
  const title = document.createElement('h1');
  title.textContent = 'Return to CommuteCircle';
  const info = document.createElement('p');
  info.textContent = 'Open the Android app on this device to finish signing in.';
  const button = document.createElement('a');
  button.className = 'btn';
  button.href = /Chrome\//.test(navigator.userAgent) ? back.intent : back.uri;
  button.textContent = 'Open CommuteCircle';
  page.append(title, info, button);
  document.querySelector('#main').replaceChildren(page);
} else {
  // An incomplete module download must offer a retry, even when the router never starts.
  import('./main.js').catch(() => {
    const main = document.querySelector('#main');
    const message = document.createElement('p');
    message.textContent = 'The ride planner could not load. Check your connection and try again.';
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.textContent = 'Try again';
    retry.onclick = () => location.reload();
    main.replaceChildren(message, retry);
  });
}
