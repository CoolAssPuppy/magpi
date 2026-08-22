# Loading device code the way a badge would load it, with an import missing.
#
# Several fallbacks in the SDK only run when a module is not there: urequests
# standing in for requests, uhashlib for hashlib, no HTTP client at all, no os.
# Under CPython every one of those imports succeeds, so the only way to reach
# the fallback is to run the file again with the name refused.
#
# Not a test module. Named with a leading underscore so unittest discovery
# ignores it and imported by the suites that need it.

import importlib.util
import sys

_MISSING = object()


class _Refuse:
    """A meta path finder that refuses a fixed set of module names."""

    def __init__(self, names):
        self.names = set(names)

    def find_spec(self, name, path=None, target=None):
        if name in self.names:
            raise ImportError("refused for this test: %s" % name)
        return None

    # MicroPython-era import hooks are gone from CPython 3.12, but a stale
    # entry costs nothing and keeps the finder usable either way.
    def find_module(self, name, path=None):
        return self.find_spec(name, path)


class _Registry:
    """Puts sys.modules back exactly as it was found."""

    def __init__(self):
        self._saved = {}

    def take(self, name):
        if name not in self._saved:
            self._saved[name] = sys.modules.get(name, _MISSING)

    def restore(self):
        for name, module in self._saved.items():
            if module is _MISSING:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
        self._saved = {}


class refused_imports:
    """Inside the block, importing any of these names raises ImportError.

    A module already in sys.modules is imported straight out of the cache and
    never reaches a finder, so each name is lifted out for the duration and
    put back afterwards."""

    def __init__(self, *names):
        self._names = names
        self._finder = _Refuse(names)
        self._registry = _Registry()

    def __enter__(self):
        for name in self._names:
            self._registry.take(name)
            sys.modules.pop(name, None)
        sys.meta_path.insert(0, self._finder)
        return self

    def __exit__(self, *exc):
        sys.meta_path.remove(self._finder)
        self._registry.restore()
        return False


class swapped_modules:
    """Inside the block, sys.modules holds these stand-ins instead."""

    def __init__(self, **modules):
        self._modules = modules
        self._registry = _Registry()

    def __enter__(self):
        for name, module in self._modules.items():
            self._registry.take(name)
            sys.modules[name] = module
        return self

    def __exit__(self, *exc):
        self._registry.restore()
        return False


def load_module(path, name, refused=(), provided=None):
    """Execute a source file again under a throwaway module name.

    `refused` names raise ImportError while the file runs; `provided` maps a
    name to a stand-in installed for the same window. The throwaway module is
    never left in sys.modules, so the real one keeps its place and every other
    test sees the module it expects.

    Coverage is recorded against the file, not the name it ran under, so a
    fallback exercised here counts for the module it lives in."""
    refused = tuple(refused)
    provided = dict(provided or {})
    registry = _Registry()
    finder = _Refuse(refused)

    for key in refused:
        registry.take(key)
        sys.modules.pop(key, None)
    for key, module in provided.items():
        registry.take(key)
        sys.modules[key] = module
    sys.meta_path.insert(0, finder)
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        finally:
            sys.modules.pop(name, None)
        return module
    finally:
        sys.meta_path.remove(finder)
        registry.restore()
