# Skill: untrusted HTML sandbox

## Use when
Any HTML or script written by a model is shown or exported.

## Steps
1. Strip code fences and commentary; cut to the first <style or <!doctype and the last closing tag.
2. Reject if too short or too long, or if the closing tag is missing (then try a continuation call).
3. Reject on blocked code: fetch, XMLHttpRequest, WebSocket, sendBeacon, localStorage, sessionStorage, document.cookie, window.parent or top, eval, new Function, dynamic import, script src other than the pinned three.js, external stylesheets other than Google Fonts.
4. Reject placeholder text: lorem ipsum, "your text here", "add your copy".
5. Parse scripts with new Function to catch syntax errors before mounting.
6. Mount only in an iframe with sandbox="allow-scripts" and a content-security policy: default-src none, inline scripts and styles, fonts from Google, no connect, no forms.
7. Never write a literal closing script tag inside the Studio's own logic; split the string, or the page ends there.

## Verify
A widget containing fetch( is rejected with the reason; a cut-off widget is completed or reported; the page loads with the closing script tag only at the file's end.
