// This page shares an already registered HTTPS OAuth redirect with the Android app.
// The mobile verifier stays in Android's secure storage. Only a single-use code returns.
export function nativeReturn(search) {
  const params = new URLSearchParams(search);
  const state = params.get('state') || '';
  const match = /^ccnative\.v1\.(preview|app)\.[a-f0-9]{32}$/.exec(state);
  if (!match || (!params.has('code') && !params.has('error'))) return null;
  const app = 'io.github.nagoor06.commutecircle' + (match[1] === 'preview' ? '.preview' : '');
  const result = new URLSearchParams({state});
  if (params.has('error')) result.set('error','access_denied');
  else result.set('code',params.get('code'));
  const target = 'oauth/callback?' + result.toString();
  return {uri:app+'://'+target, intent:'intent://'+target+'#Intent;scheme='+app+';package='+app+';end'};
}
