import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingState,motion} from '../../services/api/app/studio/app/data/tracking.js';
const now=Date.parse('2026-11-05T12:00:00Z'),date=offset=>new Date(now+offset).toISOString();
const snapshot=()=>({state:'live',server_time:date(0),updated_at:date(0),expires_at:date(3600000),position:{observed_at:date(-10000)}});

test('a stalled response ages into stale and expired without another network response',()=>{
  const data=snapshot();
  assert.equal(trackingState(data,0),'live');
  assert.equal(trackingState(data,51000),'stale');
  assert.equal(trackingState(data,300000),'ended');
  assert.equal(trackingState({...data,expires_at:date(1000)},1001),'ended');
  assert.equal(trackingState({...data,position:null}),'waiting');
  assert.equal(trackingState({state:'off',position:null}),'off');
  assert.equal(trackingState({...data,state:'stale'}),'stale');
});

test('marker interpolation never extrapolates a vehicle and crosses the date line correctly',()=>{
  assert.deepEqual(motion([16,80],[17,81],0),[16,80]);
  assert.deepEqual(motion([16,80],[17,81],.5),[16.5,80.5]);
  assert.deepEqual(motion([16,80],[17,81],10),[17,81]);
  assert.ok(Math.abs(motion([0,179.9],[0,-179.9],.5)[1])>179.9);
});
