const V_max = 9.46e14;
// We integrate dv/(16 + k*v*(1 - v/V_max)) = dt
for(let k=0.5; k<2.5; k+=0.1) {
  let t = 0; let v=0; let steps=10000; let dv=V_max/steps;
  for(let i=0; i<steps; i++) {
    let v_mid = i*dv + dv/2;
    t += dv / (16 + k*v_mid*(1 - v_mid/V_max));
  }
  console.log(k, t);
}
