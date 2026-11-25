import type { UnitSystem } from '../api/projects'

// Depths and distances come from the API unrounded, in the unit system it names. They're shown rounded to two decimals
// in metres or one in feet, half away from zero, and without trailing zeros (30, not 30.00).
export function roundLength(value: number, unitSystem: UnitSystem) {
  return roundHalfAwayFromZero(value, unitSystem === 'imperial' ? 1 : 2)
}

// Rounds the number as it's written in decimal, so 1.005 rounds up to 1.01 even though the nearest binary number to it
// is a little less. toExponential gives the shortest digits that read back as the same number, and moving the decimal
// point by changing the exponent leaves those digits as they are, where multiplying wouldn't.
function roundHalfAwayFromZero(value: number, decimals: number) {
  const [digits, exponent] = Math.abs(value).toExponential().split('e')
  const rounded = Math.round(Number(`${digits}e${Number(exponent) + decimals}`))
  return Math.sign(value) * Number(`${rounded}e-${decimals}`)
}
