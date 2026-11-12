const key = 'cc:plan:' + new URL('./', location.href).pathname;
const maxAge = 30 * 60 * 1000;
export const emptyRoute = () => [{name:''}, {name:''}];

export function restorePlan() {
  try {
    const plan = JSON.parse(sessionStorage.getItem(key));
    if (plan?.until > Date.now() && Array.isArray(plan.route) && plan.route.length === 2 &&
        plan.route.every(stop => typeof stop?.name === 'string' && stop.name.length <= 120)) {
      // Older versions wrote the example route on every visit, even with no user input.
      const [a,b] = plan.route;
      const oldExample = !plan.version && a.name === 'Tenali Junction' && a.lat === 16.24241 &&
        a.lon === 80.64041 && b.name === 'Vijayawada Bus Station' && b.lat === 16.5076 && b.lon === 80.6139;
      return {route:oldExample ? emptyRoute() : plan.route, date:plan.date,
        query:oldExample ? null : plan.query};
    }
    sessionStorage.removeItem(key);
  } catch {}
  return {route:emptyRoute(), date:'', query:null};
}

export function rememberPlan({route, date, query}) {
  try {
    const manualStops = route.map(stop => stop.source === 'device' ? {name:''} : stop);
    sessionStorage.setItem(key, JSON.stringify({version:2, route:manualStops, date, query, until:Date.now()+maxAge}));
  } catch {}
}

export function forgetPlan() {
  try {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem('cc:offer-signin');
  } catch {}
}
