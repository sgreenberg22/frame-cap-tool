import { formatClock, formatTimecode, parseTime, fileTimecode } from './timecode'

describe('timecode', () => {
  it('formats HH:MM:SS:FF', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00')
    expect(formatTimecode(1.5, 30)).toBe('00:00:01:15')
    expect(formatTimecode(3661 + 2 / 24, 24)).toBe('01:01:01:02')
    expect(formatTimecode(-4, 30)).toBe('00:00:00:00')
  })
  it('formats clock time', () => {
    expect(formatClock(83.5)).toBe('1:23.500')
    expect(formatClock(3725, { ms: false })).toBe('1:02:05')
    expect(fileTimecode(61.25)).toBe('1-01.250')
  })
  it('parses many input styles', () => {
    expect(parseTime('12.5')).toBe(12.5)
    expect(parseTime('1:23')).toBe(83)
    expect(parseTime('1:02:03.5')).toBe(3723.5)
    expect(parseTime('f60', 30)).toBe(2)
    expect(parseTime('90f', 30)).toBe(3)
    expect(parseTime('00:00:01:15', 30)).toBe(1.5)
    expect(parseTime('abc')).toBeNaN()
    expect(parseTime('')).toBeNaN()
  })
})
