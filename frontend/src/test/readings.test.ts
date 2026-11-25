import { describe, expect, it } from 'vitest'
import { roundLength } from '../pages/readings'

describe('roundLength', () => {
  it.each([
    [30, 30],
    [12.504, 12.5],
    [8.125, 8.13],
    // The nearest binary numbers to these are a little less, and they still round up.
    [1.005, 1.01],
    [2.675, 2.68],
    [1.0049999, 1],
    [9.144, 9.14],
    [0.004, 0],
    [0, 0],
    [99999.995, 100000],
    [-1.005, -1.01],
  ])('rounds %d metres to %d', (value, rounded) => {
    expect(roundLength(value, 'metric')).toBe(rounded)
  })

  it.each([
    [30, 30],
    [30.25, 30.3],
    [30.24, 30.2],
    [1.01, 1],
    // 0.04572 metres, exactly.
    [0.15, 0.2],
    // 9.14 metres, as near as a number in the browser gets.
    [29.986876640419947, 30],
    // 12.3 metres.
    [40.35433070866142, 40.4],
  ])('rounds %d feet to %d', (value, rounded) => {
    expect(roundLength(value, 'imperial')).toBe(rounded)
  })
})
