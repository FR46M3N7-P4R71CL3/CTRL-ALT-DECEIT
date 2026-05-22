const DEBUG_MODE = true;

function logDebug(...args) {
  if (DEBUG_MODE) {
    console.log("[LinkedIn AI Filter]", ...args);
  }
}

function checkAIViaBackground(text) {
  return new Promise((resolve) => {
    logDebug("Sending message to background script for text evaluation...", text.substring(0, 50) + "...");
    chrome.runtime.sendMessage({ action: 'checkAI', text: text }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[LinkedIn AI Filter] Runtime error:", chrome.runtime.lastError);
        resolve(false);
      } else {
        logDebug("Received response from background script:", response);
        resolve(response && response.isAI);
      }
    });
  });
}

function removePostIfAI(postElement) {
  // If we already marked it checked AND found text, don't check again.
  // We use aiChecked text hash to make sure we don't re-check the same text if re-rendered.

  const textContainer = postElement.querySelector('.feed-shared-update-v2__commentary, .update-components-text, .feed-shared-text, .update-components-actor__description, .feed-shared-update-v2__description');

  if (!textContainer) {
      logDebug("Text container not found for post yet. Skipping.");
      // The text container hasn't loaded yet. Do not mark as checked.
      return;
  }

  const text = textContainer.innerText.trim();

  if (text.length <= 10) {
      logDebug("Text too short to evaluate. Skipping. Text:", text);
      // Text too short to evaluate. Mark as checked to prevent infinite loop.
      postElement.dataset.aiChecked = 'true';
      return;
  }

  const textHash = text.substring(0, 32);

  if (postElement.dataset.aiChecked === textHash) {
      logDebug("Already checked this specific text content. Skipping. Hash:", textHash);
      return; // Already checked this specific text content
  }

  logDebug("Marking post as checked for text hash:", textHash);
  postElement.dataset.aiChecked = textHash; // Mark as checked for this text

  checkAIViaBackground(text).then(isAI => {
    if (isAI) {
      logDebug("Removing AI-generated post.");
      // Hide the entire post card to adblock it.
      postElement.style.display = 'none';
      postElement.remove(); // Added remove here for stronger guarantee of complete unrendering
    } else {
      logDebug("Post is not considered AI-generated.");
    }
  });
}

// Observe DOM mutations to catch newly loaded posts in the feed
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList && node.classList.contains('feed-shared-update-v2')) {
          logDebug("MutationObserver: Found post with class feed-shared-update-v2");
          removePostIfAI(node);
        } else if (node.hasAttribute && node.hasAttribute('data-urn') && node.getAttribute('data-urn').includes('activity')) {
          logDebug("MutationObserver: Found post with data-urn activity");
          removePostIfAI(node);
        } else if (node.closest && node.closest('.feed-shared-update-v2')) {
            logDebug("MutationObserver: Found post inside feed-shared-update-v2");
            removePostIfAI(node.closest('.feed-shared-update-v2'));
        } else if (node.closest && node.closest('[data-urn*="activity"]')) {
            logDebug("MutationObserver: Found post inside data-urn activity");
            removePostIfAI(node.closest('[data-urn*="activity"]'));
        } else {
          // Check inside the added node
          const posts = node.querySelectorAll('.feed-shared-update-v2, div[data-urn*="activity"]');
          if (posts.length > 0) {
            logDebug("MutationObserver: Found posts inside added node:", posts.length);
          }
          posts.forEach(post => removePostIfAI(post));
        }
      }
    });
  });
});

// Start observing the main document body
if (document.body) {
    logDebug("Starting observer on document.body...");
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
} else {
    logDebug("document.body not ready, waiting for DOMContentLoaded...");
    document.addEventListener('DOMContentLoaded', () => {
        logDebug("DOMContentLoaded event fired, starting observer on document.body...");
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
    });
}

// Run once for initially loaded posts (if script loads late)
document.addEventListener('DOMContentLoaded', () => {
    const posts = document.querySelectorAll('.feed-shared-update-v2, div[data-urn*="activity"]');
    logDebug("DOMContentLoaded: Running initially for posts found:", posts.length);
    posts.forEach(removePostIfAI);
});
// Fallback if already loaded
const initialPosts = document.querySelectorAll('.feed-shared-update-v2, div[data-urn*="activity"]');
logDebug("Fallback: Running for posts found immediately:", initialPosts.length);
initialPosts.forEach(removePostIfAI);
