on run
  -- The app itself cannot reliably read Documents when Spotlight starts it.
  -- Terminal receives the helper as a document and runs it with the user's
  -- normal local-file access instead.
  set appBundlePath to POSIX path of (path to me)
  set helperPath to appBundlePath & "Contents/Resources/launch-personal-excalidraw.command"

  try
    do shell script "/usr/bin/open -g -j -a Terminal " & quoted form of helperPath
  on error errorMessage
    display alert "Excalidraw Local could not start" message errorMessage as critical
  end try
end run
