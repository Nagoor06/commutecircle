import {places} from './places.js';

const key = 'cc:plan:' + new URL('./', location.href).pathname;
const maxAge = 30 * 60 * 1000;

export function restorePlan() {
  try {
    const plan = JSON.parse(sessionStorage.getItem(key));
    if (plan?.until > Date.now() && plan.route?.length === 2 &&
        plan.route.every(stop => typeof stop?.name === 'string' && stop.name.length <= 120)) {
      return {route: plan.route, date: plan.date, query: plan.query};
    }
    sessionStorage.removeItem(key);
  } catch {}
  return {route: [{...places[0]}, {...places[1]}], date: '', query: null};
}

export function rememberPlan({route, date, query}) {
  try {
    sessionStorage.setItem(key, JSON.stringify({route, date, query, until: Date.now() + maxAge}));
  } catch {}
}

export function forgetPlan() {
  try { sessionStorage.removeItem(key); } catch {}
}
