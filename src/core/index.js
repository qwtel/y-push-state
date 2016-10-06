/*
 * Adapted from Miguel Ángel Pérez's smoothState.js
 * https://github.com/miguel-perez/smoothState.js
 *
 * Copyright (c) 2016 Florian Klampfer
 * Licensed under MIT
 */

/* eslint-disable import/no-extraneous-dependencies, import/no-unresolved, import/extensions */
import componentCore from 'y-component/src/component-core';

import { Observable } from 'rxjs-es/Observable';
import { Subject } from 'rxjs-es/Subject';

import 'rxjs-es/add/observable/empty';
import 'rxjs-es/add/observable/fromEvent';
import 'rxjs-es/add/observable/merge';
import 'rxjs-es/add/observable/of';

import 'rxjs-es/add/observable/dom/ajax';

import 'rxjs-es/add/operator/catch';
import 'rxjs-es/add/operator/delay';
import 'rxjs-es/add/operator/do';
import 'rxjs-es/add/operator/filter';
import 'rxjs-es/add/operator/map';
import 'rxjs-es/add/operator/mergeAll';
import 'rxjs-es/add/operator/retry';
import 'rxjs-es/add/operator/switch';
import 'rxjs-es/add/operator/switchMap';
import 'rxjs-es/add/operator/materialize';
import 'rxjs-es/add/operator/zip';

import { shouldLoadAnchor, getScrollTop, getScrollHeight } from '../common';

const LINK_SELECTOR = 'a[href]'; // 'a[href^="/"]';

// requirements
// object.assign, queryslector, el.match

// window.Observable = Observable;

function minDur(time) {
  return this.zip(Observable.of(null).delay(time))
    .map(([$]) => $);
}

// ~ mixin smoothStateCore with componentCore { ...
export default C => class extends componentCore(C) {

  // @override
  componentName() {
    return 'y-smooth-state';
  }

  startHistory() {
    this.bindCallbacks();

    if (this.replaceIds.length === 0) {
      const id = this.eventSource().id;
      if (id) {
        console.warn(`No replace ids provided. Will replace entire content of #${id}`); // eslint-disable-line no-console
      } else {
        console.error('No replace ids provided nor does this component have and id'); // eslint-disable-line no-console
        return;
      }
    }

    if ('scrollRestoration' in history) {
      if (this.scrollRestoration) history.scrollRestoration = 'manual';
      else history.scrollRestoration = 'auto';
    }

    if (this.scrollRestoration) {
      this.resetScrollPostion();
      window.addEventListener('beforeunload', () => {
        this.saveScrollPosition();
      });
    }

    this.resetScrollPostion();

    // cache title element
    this.titleElement = document.querySelector('title') || {};

    const click$$ = new Subject();

    const pushstate$ = click$$
      .switch()
      .do(() => this.saveScrollPosition())
      .map(href => ({
        push: true,
        href,
      }));

    const popstate$ = Observable.fromEvent(window, 'popstate')
      .filter(() => window.history.state != null)
      .map(() => ({
        push: false,
        href: window.location.href,
      }));

    Observable.merge(pushstate$, popstate$)
      .do(this.onBefore)
      .map(this.hrefToRquestData)
      .switchMap(this.makeRequest)
      .map(this.ajaxResponseToContent)
      .subscribe((hairball) => {
        this.updateDOM(hairball);
        click$$.next(this.bindEvents());
        this.onAfter();
      });

    // let's get the party started
    click$$.next(this.bindEvents());
  }

  // @override
  setupDOM(el) {
    return el;
  }

  // @override
  defaults() {
    return {
      replaceIds: [],
      // contentSelector: CONTENT_SELECTOR,
      linkSelector: LINK_SELECTOR,
      // loadingClass: LOADING_CLASS,
      scrollRestoration: false,
      hrefRegex: null,
      blacklist: null,
      duration: 0,
    };
  }

  // @override
  sideEffects() {
    return {
    };
  }

  bindCallbacks() {
    this.beNice = this.beNice.bind(this);
    this.hrefToRquestData = this.hrefToRquestData.bind(this);
    this.makeRequest = this.makeRequest.bind(this);
    this.ajaxResponseToContent = this.ajaxResponseToContent.bind(this);
    this.updateDOM = this.updateDOM.bind(this);
    this.onBefore = this.onBefore.bind(this);
    this.onAfter = this.onAfter.bind(this);
  }

  fragmentFromString(strHTML) {
    return document.createRange().createContextualFragment(strHTML);
  }

  onBefore() {
    // console.log(push, history.state.scrollHeight);
    //
    // if (!push && history.state.scrollHeight) {
    //   document.body.style.minHeight = `${history.state.scrollHeight}px`;
    // } else {
    //   document.body.style.minHeight = 0;
    // }
    // document.body.classList.add(this.loadingClass);
    this.fireEvent('before');
  }

  onAfter() {
    // document.body.classList.remove(this.loadingClass);
    this.fireEvent('after');
  }

  onError() {
    // document.body.classList.remove(this.loadingClass);
    this.fireEvent('error');
  }

  beNice(e) {
    return (
      !e.metaKey &&
      !e.ctrlKey &&
      shouldLoadAnchor(e.currentTarget, this.blacklist, this.hrefRegex)
    );
  }

  bindEvents() {
    return Observable.of(this.eventSource().querySelectorAll(this.linkSelector))
      .map(link => Observable.fromEvent(link, 'click'))
      .mergeAll()
      .filter(this.beNice)
      .do(e => e.preventDefault())
      .map(e => e.currentTarget.href);
  }

  hrefToRquestData(hairball) {
    return Object.assign(hairball, {
      requestData: {
        method: 'GET',
        url: hairball.href,
        responseType: 'text',
      },
    });
  }

  makeRequest(hairball) {
    return minDur.call(
      Observable
        .ajax(hairball.requestData)
        .retry(3)
        .map(ajaxResponse => Object.assign(hairball, { ajaxResponse }))
        .catch((e) => {
          this.onError(e);
          return Observable.empty();
        }),
      this.duration
    );
  }

  ajaxResponseToContent(hairball) {
    const documentFragment = this.fragmentFromString(hairball.ajaxResponse.response);
    const title = (documentFragment.querySelector('title') || {}).textContent;
    const url = hairball.ajaxResponse.request.url;

    // TODO: abort if content_selector not present
    // const content = documentFragment.querySelectorAll(this.contentSelector);
    let content;
    if (this.replaceIds.length > 0) {
      content = this.replaceIds.map(id => documentFragment.querySelector(`#${id}`));
    } else {
      content = documentFragment.getElementById(this.eventSource().id);
    }

    return Object.assign(hairball, { title, url, content });
  }

  updateDOM({ title, content, url, push }) {
    // update title separately
    // TODO: update meta description?
    this.titleElement.textContent = title;

    // push new frame to history if not a popstate
    if (push) {
      window.history.pushState({}, title, url);
    }

    this.resetScrollPostion();

    if (this.replaceIds.length > 0) {
      const oldContent = this.replaceIds.map(id => document.getElementById(id));

      // TODO: replace existing ids, remove missing ides
      if (content.length !== oldContent.length) {
        throw Error("New document doesn't contain the same number of ids");
      }

      Array.from(oldContent).forEach((oldElement, i) => {
        const element = content[i];
        oldElement.parentNode.replaceChild(element, oldElement);
      });
    } else {
      const oldContent = this.eventSource();
      oldContent.innerHTML = content.innerHTML;
    }
  }

  saveScrollPosition() {
    if (this.scrollRestoration) {
      const state = history.state || {};
      state.scrollTop = getScrollTop();
      state.scrollHeight = getScrollHeight();
      history.replaceState(state, document.title, window.location.href);
    }
  }

  resetScrollPostion() {
    if (this.scrollRestoration) {
      const state = history.state || {};
      setImmediate(() => {
        document.body.style.willChange = 'scroll-position';
        requestAnimationFrame(() => {
          document.body.style.minHeight = `${state.scrollHeight || 0}px`;
          window.scrollTo(window.pageXOffset, state.scrollTop || 0);
          document.body.style.willChange = '';
        });
      });
    }
  }
};
