
## IMPORTANT FIRST

# fixing 
not ending scaning, notification not dissapearing

# fixing ui mount 
Fixing the lack of skeleton every time the app opened, and the main grid is loading the image.

# upgrading 
the doument detection "as document" before scan
services\ai\visualDocumentDetector.ts

Interegate Ai summers of "what they think this document is" for better search result.

# updating pagination
adding pagination to flashlist.

# upgrade search ux
While in search query active, the button back Wil trigger a clean the query handle instead of exiting the app.

# upgrade scan time 
All image are being scan to only to fingerprint and UI visual of the image to show it in the document grid, so the scan will be quickly as possible.
Every time the user click on one of the images, in that moment the image get scanned and saved in the deceive memory.

# update gallery behavior ux
Implement pinch zoom for the document grid, so the user could see the over all image by part time haders.

# adding ui status info
Adding next scan time to the status bar, and adding info tap for the statistic app info.

# updating ux deletion
UseOptimistic for action like delete.

# for later
--
Adding the option to add selection of image as new batch.
--
Adding specific albom.
--
Adding the option to scan multiple number of photo shots at the same time.
--
Creating a search bubble that expand to search bar.
--
implementing - ai that resoning the ocr text for better search