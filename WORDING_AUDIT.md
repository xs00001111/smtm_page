# SMTM Bot Wording Audit & Improvement Proposals

## 📊 Overall Observations

### Strengths
- Good use of emojis for visual clarity
- Consistent command structure
- Clear error messages with actionable guidance

### Areas for Improvement
1. **Inconsistent Loading Messages** - Mix of "Fetching", "Searching", "Finding"
2. **Generic Error Messages** - Could be more specific
3. **Technical Jargon** - Some messages assume user knowledge
4. **Missing Context** - Some success messages could provide next steps
5. **Redundant Information** - Some help text repeats

---

## 🔍 Specific Improvements by Category

### 1. Loading/Progress Messages

#### Current Issues
- Inconsistent verbs: "Fetching", "Searching", "Finding", "Looking up"
- Some are too technical

#### Proposed Changes

| Command | Current | Proposed | Reason |
|---------|---------|----------|--------|
| `/price` | "🔍 Fetching market price..." | "🔍 Looking up market..." | Shorter, clearer |
| `/search markets` | "🔍 Searching markets..." | "🔍 Searching..." | Redundant, obvious from context |
| `/search whales` | "🔍 Searching whales..." | "🔍 Searching..." | Same as above |
| `/whales` | "🔍 Fetching top whales from Polymarket leaderboard..." | "🔍 Loading top traders..." | Too technical, shorter |
| `/whales <market>` | "🔍 Finding whales for market..." | "🔍 Loading market whales..." | More consistent |
| `/markets` | "🔍 Fetching trending markets..." | "🔍 Loading markets..." | Consistent verb usage |
| `/unsubscribe` | "🔍 Searching for market..." | "🔍 Looking up market..." | Consistent with /follow |
| `/daily_tip` | "🔍 Fetching today's highest reward market from Polymarket..." | "🔍 Loading today's top reward..." | Shorter, less technical |

**Recommendation:** Standardize on:
- "Loading" for data fetching
- "Looking up" for validation/checking

---

### 2. Error Messages

#### Current Issues
- Generic "Please try again later" without specifics
- Some errors don't suggest alternatives
- Inconsistent error emoji usage (❌ vs ⚠️)

#### Proposed Changes

| Current | Proposed | Improvement |
|---------|----------|-------------|
| "❌ An error occurred while fetching price data. Please try again." | "❌ Unable to load market data. Try another market or check your connection." | More specific, actionable |
| "❌ Search failed. Please try again later." | "❌ Search unavailable. Try /markets to browse instead." | Provides alternative |
| "❌ Failed to fetch whales. Please try again later." | "❌ Unable to load whales. Try a specific market: /whales 0x<market_id>" | Suggests workaround |
| "❌ An error occurred. Please try again later." | "❌ Something went wrong. If this persists, contact support." | More honest, offers help |
| "⚠️ Market found but price data unavailable." | "⚠️ This market doesn't have price data yet. Try another market." | More helpful |
| "❌ Unable to resolve token for this market right now. Try again shortly." | "❌ This market isn't ready for alerts yet. Try /markets for active markets." | Clearer cause, better alternative |

**Recommendation:** Use ❌ for failures, ⚠️ for warnings/limitations

---

### 3. Success Messages

#### Current Issues
- Don't always provide next steps
- Could be more encouraging
- Some are too verbose

#### Proposed Changes

| Current | Proposed | Improvement |
|---------|----------|-------------|
| "✅ Following market: [question]" | "✅ Alerts enabled for this market! You'll get notified of price changes." | Clarifies what happens next |
| "✅ Following whale [addr] across ALL markets!" (with long explanation) | "✅ Following whale [addr] on all markets! 🔔 You'll get alerts on every trade they make." | More concise, clearer |
| "✅ Following whale [addr] in: [question]" | "✅ Following whale [addr] on this market! 🔔 You'll get alerts when they trade." | Consistent with above |
| "✅ Unfollowed market: [question]" | "✅ Alerts disabled for this market." | Clearer about what changed |
| "✅ Unfollowed whale [addr] from ALL markets" | "✅ Stopped following whale [addr] on all markets." | More natural language |

---

### 4. Help/Usage Text

#### Current Issues
- Some repetition between /start and /help
- Could better explain what commands do (not just syntax)
- Missing examples for complex commands

#### Proposed Changes

**Current /start:**
```
Welcome to SMTM Bot! 🎯

🔍 Discovery:
• /markets — Browse hot markets
• /whales — Top traders leaderboard
...
```

**Proposed /start:**
```
Welcome to SMTM Bot! 🎯

Track prediction markets and copy successful traders.

🔥 Quick Start:
• /markets — Browse trending markets
• /follow 0x<market_id> — Get price alerts
• /whales — See top traders

💡 First time? Use /help for full commands
```

**Reason:** More focused, explains purpose, guides new users

---

**Current /help:**
Too detailed for quick reference

**Proposed:** Add command categories with brief descriptions:
```
📚 SMTM Bot Help

📊 MARKETS
/markets — Browse trending markets
/price <market> — Get current prices
/search markets <query> — Find markets

🐋 WHALES
/whales — Top trader leaderboard
/search whales <name> — Find traders

🔔 ALERTS
/follow <market_id> — Price change alerts
/follow <wallet> — Copy trader (all markets)
/follow <wallet> <market_id> — Track on one market
/list — View your active follows

⚙️ OTHER
/status — Bot connection status
/daily_tip — Today's top reward market

💡 Tip: Get market IDs from /markets command
```

**Reason:** Better organized, easier to scan

---

### 5. Empty State Messages

#### Current Issues
- Some are discouraging
- Don't always guide user to action

#### Proposed Changes

| Current | Proposed | Improvement |
|---------|----------|-------------|
| "📭 You have no follows.\nUse /markets to get a market ID, then /follow 0x<market_id>." | "📭 No follows yet! Get started:\n• /markets — Browse markets\n• /whales — Find top traders" | More encouraging, clearer steps |
| "❌ No markets found for '[query]'\n\nTry:\n• Different keywords\n• /markets to browse hot markets" | "❌ No matches for '[query]'\n\nTry:\n• Different keywords (e.g., 'election', 'crypto')\n• /markets to browse trending" | Better examples |
| "❌ No whales found for '[query]'\n\nTry:\n• Different name or address\n• /whales to see top traders" | "❌ No traders match '[query]'\n\nTry:\n• Different search terms\n• /whales for leaderboard" | More natural language |

---

### 6. Technical Terms to Simplify

| Technical | User-Friendly |
|-----------|---------------|
| "condition_id" → "market_id" | ✅ Already fixed |
| "token" | "market" (in user messages) |
| "subscribe" | "follow" | ✅ Already using |
| "leaderboard" | Could also say "rankings" |
| "Polymarket" in messages | Often unnecessary, just say "market" |

---

### 7. Specific Command Improvements

#### `/test_push`
**Current:**
```
No active follows found.

Follow examples:
• /follow 0x<market_id> (price alerts)
...
```

**Proposed:**
```
⚠️ Can't send test - no active follows!

To test alerts:
1. /markets to find a market
2. /follow <market_id> to enable alerts
3. /test_push to test
```

**Reason:** Clearer sequence of actions

---

#### `/unsubscribe` (deprecated)
**Current:** Just searches and unsubscribes

**Issue:** Command name is confusing vs /unfollow

**Proposed:**
- Remove `/unsubscribe` entirely (redirect to /unfollow)
- Or make it an alias with clear deprecation:
```
⚠️ This command is being removed. Use /unfollow instead.

Redirecting to /unfollow...
```

---

#### `/list`
**Current:** Shows raw condition IDs in some cases

**Proposed:** Always show market questions when possible, with IDs as secondary info

---

### 8. Consistency Issues

#### Issue: Emoji usage not standardized
**Recommendation:**
- 🔍 = Loading/Searching
- ✅ = Success
- ❌ = Error/Failure
- ⚠️ = Warning/Info
- 💡 = Tip/Help
- 🔔 = Alert/Notification related
- 📊 = Market data
- 🐋 = Whale/Trader related

#### Issue: Address formatting inconsistent
**Recommendation:** Always show as `0x1234...5678` (6 chars + ... + 4 chars)

---

## 🎯 Priority Recommendations

### HIGH PRIORITY (User Confusion)
1. ✅ Standardize "Resolving market" → Done
2. Make error messages more specific with alternatives
3. Standardize loading messages (use "Loading...")
4. Add next steps to success messages

### MEDIUM PRIORITY (UX Polish)
5. Improve empty state messages
6. Shorten verbose messages
7. Better organize /help command
8. Remove technical jargon

### LOW PRIORITY (Nice to Have)
9. Add more examples in help text
10. Improve /start for first-time users
11. Better emoji consistency
12. Personality/brand voice

---

## 💬 Tone & Voice Guidelines

**Current:** Mix of technical and friendly
**Proposed:**

- ✅ **Do:** Be concise, helpful, action-oriented
- ✅ **Do:** Use emojis for visual clarity (not decoration)
- ✅ **Do:** Provide alternatives when something fails
- ✅ **Do:** Use natural language over technical terms
- ❌ **Don't:** Over-explain or be verbose
- ❌ **Don't:** Use jargon (tokens, conditions, resolution)
- ❌ **Don't:** Sound robotic or generic
- ❌ **Don't:** Leave users stuck without next steps

---

## 📝 Implementation Approach

### Phase 1: Critical Fixes (Now)
- Standardize loading messages
- Improve error messages with alternatives
- Add next steps to success messages

### Phase 2: UX Polish (Next)
- Reorganize /help and /start
- Improve empty states
- Shorten verbose messages

### Phase 3: Refinement (Later)
- Add more examples
- Personality touches
- Advanced features help

---

## 🧪 Testing Checklist

After changes, test:
- [ ] All error paths have helpful messages
- [ ] All success messages explain what happens next
- [ ] No technical jargon in user-facing text
- [ ] Emojis used consistently
- [ ] Loading messages are uniform
- [ ] Help text is easy to scan
- [ ] Examples are realistic and helpful
