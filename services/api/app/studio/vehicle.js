export function vehicleCard(vehicle,rating,source){
 const el=id=>document.getElementById(id);
 el('source').textContent=source;
 el('carTitle').textContent=vehicle?[vehicle.make,vehicle.model].join(' '):'Vehicle details unavailable';
 el('rating').textContent=rating.count?'★ '+Number(rating.average).toFixed(1)+' / 5':'No ratings yet';
 el('reviews').textContent=rating.count+' rider review'+(rating.count===1?'':'s');
 el('facts').replaceChildren();
 if(!vehicle)return;
 const purchased=new Date(vehicle.purchased_on+'T00:00:00Z');
 for(const [label,value] of [['Colour',vehicle.color],['Purchased',purchased.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})],['Condition',vehicle.condition+' · driver reported']]){
 const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;el('facts').append(dt,dd)}
}
