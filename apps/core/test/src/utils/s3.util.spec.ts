import { Readable } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { S3Uploader } from '~/utils/s3.util'

const PART_SIZE = 8 * 1024 * 1024

const createUploader = () =>
  new S3Uploader({
    bucket: 'test-bucket',
    region: 'auto',
    accessKey: 'ak',
    secretKey: 'sk',
    endpoint: 'https://example.r2.cloudflarestorage.com',
  })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('S3Uploader.uploadStream', () => {
  it('uploads equal-length non-trailing parts regardless of chunk boundaries', async () => {
    const uploader = createUploader()
    const partBodies: Buffer[] = []

    vi.spyOn(uploader as any, 'signedRequest').mockImplementation(
      async (options: any) => {
        if (options.method === 'POST' && 'uploads' in (options.query ?? {})) {
          return new Response('<UploadId>test-upload-id</UploadId>', {
            status: 200,
          })
        }
        if (options.method === 'PUT') {
          partBodies.push(Buffer.from(options.body))
          return new Response(null, {
            status: 200,
            headers: { etag: `"etag-${partBodies.length}"` },
          })
        }
        return new Response('<CompleteMultipartUploadResult/>', {
          status: 200,
        })
      },
    )

    const chunkSizes = [1_000_003, 777_777, 3_333_331, 65_536]
    const total = PART_SIZE * 2 + 123_456
    let seed = 0
    const input = Buffer.alloc(total)
    for (let i = 0; i < total; i++) input[i] = i % 251

    async function* generate() {
      let offset = 0
      while (offset < total) {
        const size = Math.min(
          chunkSizes[seed++ % chunkSizes.length],
          total - offset,
        )
        yield input.subarray(offset, offset + size)
        offset += size
      }
    }

    await uploader.uploadStream(
      Readable.from(generate()),
      'videos/test.mp4',
      'video/mp4',
    )

    expect(partBodies.length).toBeGreaterThanOrEqual(3)
    for (const part of partBodies.slice(0, -1)) {
      expect(part.length).toBe(PART_SIZE)
    }
    expect(Buffer.concat(partBodies).equals(input)).toBe(true)
  })

  it('uploads a single empty part for an empty stream', async () => {
    const uploader = createUploader()
    const partBodies: Buffer[] = []

    vi.spyOn(uploader as any, 'signedRequest').mockImplementation(
      async (options: any) => {
        if (options.method === 'POST' && 'uploads' in (options.query ?? {})) {
          return new Response('<UploadId>test-upload-id</UploadId>', {
            status: 200,
          })
        }
        if (options.method === 'PUT') {
          partBodies.push(Buffer.from(options.body))
          return new Response(null, {
            status: 200,
            headers: { etag: `"etag-${partBodies.length}"` },
          })
        }
        return new Response('<CompleteMultipartUploadResult/>', {
          status: 200,
        })
      },
    )

    await uploader.uploadStream(
      Readable.from([]),
      'files/empty.bin',
      'application/octet-stream',
    )

    expect(partBodies.length).toBe(1)
    expect(partBodies[0].length).toBe(0)
  })
})

describe('S3Uploader endpoint path prefixes', () => {
  const createSupabaseUploader = () =>
    new S3Uploader({
      bucket: 'blog-assets',
      region: 'ap-southeast-1',
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      endpoint: 'https://project-ref.storage.supabase.co/storage/v1/s3/',
    })

  it('preserves the endpoint path for uploads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await createSupabaseUploader().uploadToS3(
      'images/test.png',
      Buffer.from('image'),
      'image/png',
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.storage.supabase.co/storage/v1/s3/blog-assets/images/test.png',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('returns a normalized public URL when the endpoint has a trailing slash', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const publicUrl = await createSupabaseUploader().uploadBuffer(
      Buffer.from('image'),
      'images/test.png',
      'image/png',
    )

    expect(publicUrl).toBe(
      'https://project-ref.storage.supabase.co/storage/v1/s3/blog-assets/images/test.png',
    )
  })

  it('preserves the endpoint path for deletes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await createSupabaseUploader().deleteObject('images/test.png')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.storage.supabase.co/storage/v1/s3/blog-assets/images/test.png',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('preserves the endpoint path for multipart uploads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<UploadId>test-upload-id</UploadId>', { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"test-etag"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<CompleteMultipartUploadResult />', { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await createSupabaseUploader().uploadStream(
      Readable.from([Buffer.from('video')]),
      'videos/test.mp4',
      'video/mp4',
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://project-ref.storage.supabase.co/storage/v1/s3/blog-assets/videos/test.mp4?uploads=',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://project-ref.storage.supabase.co/storage/v1/s3/blog-assets/videos/test.mp4?partNumber=1&uploadId=test-upload-id',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://project-ref.storage.supabase.co/storage/v1/s3/blog-assets/videos/test.mp4?uploadId=test-upload-id',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
