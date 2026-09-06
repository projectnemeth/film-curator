import { describe, it, expect } from 'vitest'
import { findExclusionTriggers, isHiddenByExclusion } from '../exclusion'

// Keyword sets below are the real TMDB `/movie/{id}/keywords` payloads
// (trimmed to the relevant tags) for films the family has explicitly
// ruled in or out. They're the regression suite for the watchlists.
const GET_OUT = ['kidnapping', 'manipulation', 'dark comedy', 'hypnosis', 'satire', 'racism', 'psychological thriller', 'brain surgery']
const SICARIO = ['assassin', 'mexico', 'corruption', 'fbi', 'brutality', 'murder', 'drugs', 'special forces', 'interrogation', 'mexican cartel']
const SAVING_PRIVATE_RYAN = ['self sacrifice', 'bravery', 'world war ii', 'normandy', 'd-day', 'military', 'german soldier']
const SILENCE_OF_THE_LAMBS = ['psychopath', 'fbi', 'murder', 'serial killer', 'brutality', 'cannibal', 'skinning', 'cannibalism', 'psychological horror']
const SAW = ['sadism', 'torture', 'sadist', 'survival horror', 'extreme violence', 'death game', 'sadistic horror']
const THE_EXORCIST = ['exorcism', 'possession', 'satan', 'priest', 'demon', 'demonic possession', 'religious horror']
const HEREDITARY = ['ritual', 'supernatural', 'possession', 'demon', 'ritual murder', 'satanic ritual', 'coven (akelarre)', 'séance']

describe('findExclusionTriggers', () => {
  it('does not flag Get Out — allegorical horror with no predation or occult tags', () => {
    expect(findExclusionTriggers(GET_OUT)).toEqual([])
  })

  it('does not flag Sicario — brutality and murder alone are not predation', () => {
    expect(findExclusionTriggers(SICARIO)).toEqual([])
  })

  it('does not flag war films', () => {
    expect(findExclusionTriggers(SAVING_PRIVATE_RYAN)).toEqual([])
  })

  it('flags Silence of the Lambs as predation', () => {
    const triggers = findExclusionTriggers(SILENCE_OF_THE_LAMBS)
    expect(triggers.map((t) => t.category)).toContain('PREDATION')
    expect(triggers.map((t) => t.keyword)).toContain('serial killer')
  })

  it('flags Saw as predation', () => {
    const triggers = findExclusionTriggers(SAW)
    expect(triggers.map((t) => t.category)).toContain('PREDATION')
    expect(triggers.map((t) => t.keyword)).toEqual(expect.arrayContaining(['sadism', 'torture']))
  })

  it('flags The Exorcist as occult', () => {
    const triggers = findExclusionTriggers(THE_EXORCIST)
    expect(triggers.map((t) => t.category)).toContain('OCCULT')
    expect(triggers.map((t) => t.keyword)).toContain('exorcism')
  })

  it('flags Hereditary as occult', () => {
    const triggers = findExclusionTriggers(HEREDITARY)
    expect(triggers.map((t) => t.category)).toContain('OCCULT')
    expect(triggers.map((t) => t.keyword)).toContain('satanic ritual')
  })

  it('matches whole keywords only, never substrings', () => {
    // "possession" is occult; "possession of a firearm" is not. Substring
    // matching would collapse the two.
    expect(findExclusionTriggers(['possession of a firearm'])).toEqual([])
  })

  it('is case- and whitespace-insensitive', () => {
    expect(findExclusionTriggers(['  Serial Killer '])[0]?.keyword).toBe('serial killer')
  })

  it('returns no triggers for a title with no keywords at all', () => {
    expect(findExclusionTriggers([])).toEqual([])
  })
})

// Real TMDB payloads again, trimmed to the relevant tags.
const HERE_THE_WHOLE_TIME = ['based on novel or book', 'first love', 'lgbt', 'body dysmorphia', 'gay youth', 'gay theme', 'teen']
const MULAN = ['china', 'gender disguise', 'war', 'based on a legend', 'dragon']
const GREEN_BOOK = ['road trip', 'racism', '1960s', 'lgbt', 'gay theme', 'friendship', 'based on a true story']

describe('findExclusionTriggers — LGBTQ watchlist', () => {
  it('flags a film tagged with explicit LGBTQ keywords', () => {
    const triggers = findExclusionTriggers(HERE_THE_WHOLE_TIME)
    expect(triggers.map((t) => t.category)).toContain('LGBTQ')
    expect(triggers.map((t) => t.keyword)).toEqual(expect.arrayContaining(['lgbt', 'gay theme']))
  })

  it('does not flag Mulan — `gender disguise` is a plot device, not the theme', () => {
    expect(findExclusionTriggers(MULAN)).toEqual([])
  })

  it('still flags a film where the tag reflects only a supporting character', () => {
    // Green Book is a road-trip drama; the tag is accurate but says nothing
    // about how central it is. Recording the behaviour so it is a reviewed
    // decision rather than a surprise — review is what resolves these.
    expect(findExclusionTriggers(GREEN_BOOK).map((t) => t.category)).toContain('LGBTQ')
  })

  it('keeps the categories distinct', () => {
    const triggers = findExclusionTriggers(['lgbt', 'exorcism', 'serial killer'])
    expect(triggers.map((t) => t.category).sort()).toEqual(['LGBTQ', 'OCCULT', 'PREDATION'])
  })
})

describe('isHiddenByExclusion', () => {
  it('hides a title reviewed and marked EXCLUDED', () => {
    expect(isHiddenByExclusion('EXCLUDED', GET_OUT)).toBe(true)
  })

  it('shows a title reviewed and marked CLEAR even when keywords flagged it', () => {
    // The Dark Knight carries the `sadism` tag for the Joker but is not a
    // sadism film — this is exactly the case review exists to resolve.
    expect(isHiddenByExclusion('CLEAR', ['sadism', 'superhero', 'vigilante'])).toBe(false)
  })

  it('hides an unreviewed title whose keywords trigger a watchlist', () => {
    expect(isHiddenByExclusion(null, SAW)).toBe(true)
  })

  it('shows an unreviewed title that trips no watchlist', () => {
    expect(isHiddenByExclusion(null, GET_OUT)).toBe(false)
  })
})
