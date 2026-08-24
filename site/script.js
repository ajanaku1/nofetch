const copyButton = document.querySelector('[data-copy-command]');
const copyStatus = document.querySelector('[data-copy-status]');

function setCopyState(message) {
  copyStatus.textContent = message;
  copyButton.setAttribute('aria-label', message);
}

function legacyCopy(command) {
  const input = document.createElement('textarea');
  input.value = command;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  copyButton.focus();
  return copied;
}

function copyCommand() {
  const command = copyButton.dataset.command;

  if (!navigator.clipboard) {
    setCopyState(legacyCopy(command) ? 'Copied to clipboard' : 'Copy failed — select the command manually');
    return;
  }

  navigator.clipboard.writeText(command)
    .then(() => setCopyState('Copied to clipboard'))
    .catch(() => {
      const message = legacyCopy(command) ? 'Copied to clipboard' : 'Copy failed — select the command manually';
      setCopyState(message);
    });
}

if (copyButton && copyStatus) {
  copyButton.addEventListener('click', copyCommand);
}
