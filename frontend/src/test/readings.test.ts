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
  ])('rounds %d to %d', (value, rounded) => {
    expect(roundLength(value)).toBe(rounded)
  })
})
