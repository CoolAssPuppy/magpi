import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone';

import { createClient } from '@/lib/supabase/client';

interface FileWithPreview extends File {
  preview?: string;
  errors: readonly FileError[];
}

type UseSupabaseUploadOptions = {
  /**
   * Name of bucket to upload files to in your Supabase project
   */
  bucketName: string;
  /**
   * Folder to upload files to in the specified bucket within your Supabase project.
   *
   * Defaults to uploading files to the root of the bucket
   *
   * e.g If specified path is `test`, your file will be uploaded as `test/file_name`
   */
  path?: string;
  /**
   * Allowed MIME types for each file upload (e.g `image/png`, `text/html`, etc). Wildcards are also supported (e.g `image/*`).
   *
   * Defaults to allowing uploading of all MIME types.
   */
  allowedMimeTypes?: string[];
  /**
   * Maximum upload size of each file allowed in bytes. (e.g 1000 bytes = 1 KB)
   */
  maxFileSize?: number;
  /**
   * Maximum number of files allowed per upload.
   */
  maxFiles?: number;
  /**
   * The number of seconds the asset is cached in the browser and in the Supabase CDN.
   *
   * This is set in the Cache-Control: max-age=<seconds> header. Defaults to 3600 seconds.
   */
  cacheControl?: number;
  /**
   * When set to true, the file is overwritten if it exists.
   *
   * When set to false, an error is thrown if the object already exists. Defaults to `false`
   */
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

  // An upload error belongs to a file. With no files there is nothing for one to
  // be about, so it is derived rather than cleared by an effect that set state
  // synchronously on every change to the list.
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
      // Object.assign rather than a cast. The dropzone hands back a plain File,
      // and asserting it into FileWithPreview hides a shape that is not there yet.
      const decorate = (file: File, fileErrors: readonly FileError[]): FileWithPreview =>
        Object.assign(file, { preview: URL.createObjectURL(file), errors: fileErrors });

      const validFiles = acceptedFiles
        .filter((file) => !files.find((existing) => existing.name === file.name))
        .map((file) => decorate(file, []));

      const invalidFiles = fileRejections.map(({ file, errors }) => decorate(file, errors));

      const newFiles = [...files, ...validFiles, ...invalidFiles];

      // A file carries the too-many-files marker only while the set is actually
      // over the limit, so dropping back under it clears the marker for every
      // file. The Library block reconciled this in an effect that set state
      // synchronously; it is derivable from the array being built, so it is
      // computed here instead and the effect is gone.
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

    // [Joshen] This is to support handling partial successes
    // If any files didn't upload for any reason, hitting "Upload" again will only upload the files that had errors
    const filesWithErrors = errors.map((x) => x.name);
    const filesToUpload =
      filesWithErrors.length > 0
        ? [
            ...files.filter((f) => filesWithErrors.includes(f.name)),
            ...files.filter((f) => !successes.includes(f.name)),
          ]
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
    // if there were errors previously, this function tried to upload the files again so we should clear/overwrite the existing errors.
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
