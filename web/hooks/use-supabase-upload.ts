import { useCallback, useMemo, useState } from 'react';
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone';

import { createClient } from '@/lib/supabase/client';

interface FileWithPreview extends File {
  preview?: string;
  errors: readonly FileError[];
}

type UseSupabaseUploadOptions = {
  /** Name of the bucket to upload files to. */
  bucketName: string;
  /** Folder within the bucket. Defaults to the root. */
  path?: string;
  /** Allowed MIME types, wildcards included. Defaults to all of them. */
  allowedMimeTypes?: string[];
  /** Maximum size of each file, in bytes. */
  maxFileSize?: number;
  /** Maximum number of files allowed per upload. */
  maxFiles?: number;
  /** Seconds to cache the asset for, sent as Cache-Control max-age. Defaults to 3600. */
  cacheControl?: number;
  /** Overwrite a file that already exists, rather than erroring. Defaults to false. */
  upsert?: boolean;
};

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>;

/** Stable identity, so the derived value below does not change on every render. */
const EMPTY_ERRORS: { name: string; message: string }[] = [];

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
  } = options;

  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadErrors, setErrors] = useState<{ name: string; message: string }[]>([]);

  // An upload error belongs to a file, so with no files there are no errors.
  const errors = files.length === 0 ? EMPTY_ERRORS : uploadErrors;
  const [successes, setSuccesses] = useState<string[]>([]);

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) {
      return false;
    }
    if (errors.length === 0 && successes.length === files.length) {
      return true;
    }
    return false;
  }, [errors.length, successes.length, files.length]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      // Object.assign rather than a cast, because the dropzone hands back a plain File.
      const decorate = (file: File, fileErrors: readonly FileError[]): FileWithPreview =>
        Object.assign(file, { preview: URL.createObjectURL(file), errors: fileErrors });

      const validFiles = acceptedFiles
        .filter((file) => !files.find((existing) => existing.name === file.name))
        .map((file) => decorate(file, []));

      const invalidFiles = fileRejections.map(({ file, errors }) => decorate(file, errors));

      const newFiles = [...files, ...validFiles, ...invalidFiles];

      // The too-many-files marker holds only while the set is over the limit.
      const withinLimit = newFiles.length <= maxFiles;
      setFiles(
        withinLimit
          ? newFiles.map((file) =>
              file.errors.some((e) => e.code === 'too-many-files')
                ? Object.assign(file, {
                    errors: file.errors.filter((e) => e.code !== 'too-many-files'),
                  })
                : file,
            )
          : newFiles,
      );
    },
    [files, setFiles, maxFiles],
  );

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles: maxFiles,
    multiple: maxFiles !== 1,
  });

  const onUpload = useCallback(async () => {
    setLoading(true);

    // [Joshen] Hitting "Upload" again only re-uploads the files that had errors.
    const filesWithErrors = errors.map((x) => x.name);
    // One pass, so a file that is both failed and unsuccessful is not uploaded twice.
    const filesToUpload =
      filesWithErrors.length > 0
        ? files.filter(
            (file) => filesWithErrors.includes(file.name) || !successes.includes(file.name),
          )
        : files;

    const supabase = createClient();

    const responses = await Promise.all(
      filesToUpload.map(async (file) => {
        const { error } = await supabase.storage
          .from(bucketName)
          .upload(!!path ? `${path}/${file.name}` : file.name, file, {
            cacheControl: cacheControl.toString(),
            upsert,
          });
        if (error) {
          return { name: file.name, message: error.message };
        } else {
          return { name: file.name, message: undefined };
        }
      }),
    );

    const responseErrors = responses.filter((x) => x.message !== undefined);
    // Overwrites the previous errors, since this call tried those files again.
    setErrors(responseErrors);

    const responseSuccesses = responses.filter((x) => x.message === undefined);
    const newSuccesses = Array.from(
      new Set([...successes, ...responseSuccesses.map((x) => x.name)]),
    );
    setSuccesses(newSuccesses);

    setLoading(false);
  }, [files, path, bucketName, errors, successes]);

  return {
    files,
    setFiles,
    successes,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    maxFileSize: maxFileSize,
    maxFiles: maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  };
};

export { useSupabaseUpload, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn };
