import assert from 'node:assert/strict'
import test from 'node:test'
import { schemas } from '../src/infrastructure/validation/joi'

test('module validation accepts legacy plain text', () => {
  const result = schemas.module.validate({
    title: 'Introduction',
    content: 'Welcome to the course.',
  })
  assert.equal(result.error, undefined)
})

test('module validation accepts a meaningful Tiptap document', () => {
  const content = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Learning goals', marks: [{ type: 'bold' }] }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Understand the fundamentals.',
            marks: [
              { type: 'textStyle', attrs: { color: '#2563eb', fontSize: '18px' } },
              { type: 'highlight', attrs: { color: '#fff59d' } },
            ],
          },
        ],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Practise' }] }],
          },
        ],
      },
    ],
  })
  const result = schemas.module.validate({ title: 'Introduction', content })
  assert.equal(result.error, undefined)
})

test('module validation rejects empty or unknown Tiptap content', () => {
  const empty = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
  const unknown = JSON.stringify({
    type: 'doc',
    content: [{ type: 'script', content: [{ type: 'text', text: 'unsafe' }] }],
  })
  assert.ok(schemas.module.validate({ title: 'Empty', content: empty }).error)
  assert.ok(schemas.module.validate({ title: 'Unknown', content: unknown }).error)
})
