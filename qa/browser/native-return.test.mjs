import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReturn} from '../../services/api/app/studio/app/native-return.js';
test('native sign-in returns only an authorization code to the matching installed package',()=>{
  for(const variant of ['preview','app']){
    const state='ccnative.v1.'+variant+'.'+'a'.repeat(32);
    const app='io.github.nagoor06.commutecircle'+(variant==='preview'?'.preview':'');
    const link=nativeReturn('?'+new URLSearchParams({state,code:'code/&',access_token:'unused',next:'https://unused.example/'}));
    const back=new URL(link.uri);assert.equal(back.protocol,app+':');assert.equal(back.host,'oauth');
    assert.deepEqual([...back.searchParams.keys()],['state','code']);assert.equal(back.searchParams.get('code'),'code/&');
    assert.ok(link.intent.endsWith('#Intent;scheme='+app+';package='+app+';end'));
    const denied=nativeReturn('?'+new URLSearchParams({state,error:'denied',code:'unused'}));
    assert.equal(new URL(denied.uri).searchParams.has('code'),false);
  }
});
test('ordinary website logins and incomplete mobile states stay with the web router',()=>{
  for(const query of ['?code=web&state=normal','?state=ccnative.v1.other.'+'a'.repeat(32)+'&code=bad',
    '?state=ccnative.v1.app.123&code=x','?state=ccnative.v1.app.'+'a'.repeat(32)]) assert.equal(nativeReturn(query),null);
});
