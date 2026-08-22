import assert from 'node:assert/strict'
import test from 'node:test'
import { courseModulesChanged } from '../src/application/course/CourseService'

const current = [
  { id: 'module-a', title: 'Introduction', content: 'Welcome' },
  { id: 'module-b', title: 'Practice', content: 'Try it' },
]

test('module revision detection ignores scalar course edits and surrounding whitespace', () => {
  assert.equal(
    courseModulesChanged(current, [
      { id: 'module-a', title: ' Introduction ', content: 'Welcome ' },
      { id: 'module-b', title: 'Practice', content: ' Try it' },
    ]),
    false,
  )
})

test('module revision detection resets progress for content, order, additions, and removals', () => {
  assert.equal(
    courseModulesChanged(current, [
      { id: 'module-a', title: 'Introduction', content: 'Changed' },
      current[1]!,
    ]),
    true,
  )
  assert.equal(courseModulesChanged(current, [current[1]!, current[0]!]), true)
  assert.equal(courseModulesChanged(current, [current[0]!]), true)
  assert.equal(
    courseModulesChanged(current, [...current, { title: 'New module', content: 'New content' }]),
    true,
  )
})
