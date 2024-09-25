To run this locally; make sure to first adjust the URL and the prompt if you want to check it with ollama / llama3.1. You can do this in background.js; just change these variables:

`targetUrl = "https://x.com/search?q=excelsior+-lang%3Aes+-from%3ALiberty1Jami&src=typed_query&f=live";`
Change this URL to another search url with your paramaters (just use the url in chrome). It will only work on this search (not on home and other pages).

 const apiUrl = "http://127.0.0.1:11434/api/generate";
        const prompt = `I'm looking for posts about Excelsior (usually referred to as Excelsior, Excelsior Rotterdam or Excelsiorrdam), a soccer club that is linked to new players or leaving players. I'm mainly interested in people saying stuff about Excelsior, potential new players or leaving players. As a first step I want to make sure that the link with the tweet is about a soccer club, and second if there might be a link with Excelsior. Please review this tweet {message} and respond yes or no in this json format: {{"relevant":"", "reason":""}}`;

These are the local variables. If you have a CORS issue with Ollama; just add this in terminal (mac): `launchctl setenv OLLAMA_ORIGINS "*"`. For Linux / windows you can check this article: https://medium.com/dcoderai/how-to-handle-cors-settings-in-ollama-a-comprehensive-guide-ee2a5a1beef0

*Adding the extension to chrome*
go to: chrome://extensions/ and click "load unpacked".

Select the folder of the files and open it. It should automatically add it to chrome now to your extensions list where you can activate it.

Final.. Make sure to have your notifications enabled (otherwise it won't show one :-))


----
UPDATE: 25-9; After updating Chrome and Ollama I bumped into the CORS issue again. I fixed this doing: OLLAMA_ORIGINS=chrome-extension://* ollama serve giving the extensions access to ollama. You might want to restrict access to just the extension to make it safer.