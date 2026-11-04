import {esc, icon} from '../ui.js';
const options = (values,selected) => values.map(([value,label])=>`<option value="${value}" ${String(value)===String(selected)?'selected':''}>${label}</option>`).join('');
export function filtersMarkup(q = {}) {
  return `<details class="search-filters"><summary>${icon('sliders',16)} Filters & sorting ${icon('down',14)}</summary><div class="filter-grid">
    <label class="field">Maximum segment fare (₹)<input data-filter="max_fare_paise" type="number" min="0" step="1" placeholder="Any fare" value="${q.max_fare_paise==null?'':esc(q.max_fare_paise/100)}"></label>
    <label class="field">Pickup proximity<select data-filter="radius_m">${options([[250,'Within 250 m'],[500,'Within 500 m'],[1000,'Within 1 km'],[2000,'Within 2 km'],[5000,'Within 5 km']],q.radius_m||2000)}</select></label>
    <label class="field">Drop-off proximity<select data-filter="destination_radius_m">${options([[250,'Within 250 m'],[500,'Within 500 m'],[2000,'Within 2 km'],[5000,'Within 5 km'],[15000,'Within 15 km'],[30000,'Within 30 km']],q.destination_radius_m||2000)}</select></label>
    <label class="field">Sort rides<select data-filter="sort">${options([['recommended','Best commute match'],['departure','Earliest pickup'],['price','Lowest segment fare'],['arrival','Closest drop-off']],q.sort||'recommended')}</select></label>
    <label class="field">Driver rating<select data-filter="min_rating">${options([['','Any rating'],[4,'4+ stars'],[4.5,'4.5+ stars']],q.min_rating||'')}</select></label>
    <label class="field">Available seats<select data-filter="min_seats">${options([[1,'At least 1'],[2,'At least 2'],[3,'At least 3'],[4,'At least 4']],q.min_seats||1)}</select></label>
    <label class="checkline"><input data-filter="quiet" type="checkbox" ${q.quiet?'checked':''}> Quiet ride</label>
    <label class="checkline"><input data-filter="air_conditioned" type="checkbox" ${q.air_conditioned?'checked':''}> Air conditioning</label>
    <p class="fine span-2">Proximity is straight-line distance, not a walking route. Check the actual stop. Vehicle preferences are driver-reported. Checkout reserves one seat.</p></div></details>`;
}
export function bindFilters(root, onChange) {
  const fields = [...root.querySelectorAll('[data-filter]')];
  const value = () => Object.fromEntries(fields.map(el=>{
    const key=el.dataset.filter;
    return [key,el.type==='checkbox'?el.checked:key==='sort'?el.value:el.value===''?null:Number(el.value)*(key==='max_fare_paise'?100:1)];
  }));
  fields.forEach(el=>el.addEventListener('input',()=>onChange(value())));
  return value;
}
