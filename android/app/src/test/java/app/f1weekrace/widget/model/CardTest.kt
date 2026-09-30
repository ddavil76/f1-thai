package app.f1weekrace.widget.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CardTest {
    private fun payload(state: State, session: Session?) = Payload(
        season = 2026, state = state, generatedAt = null,
        race = Race("16", "Malaysian GP", "Malaysia", "🇲🇾", "Sepang", "Kuala Lumpur", 0L, false, null),
        session = session, sessions = listOfNotNull(session), after = null,
        top3 = emptyList(), lastRace = null, showPodium = false,
    )

    @Test
    fun lightsCountUpAsStartNears() {
        assertEquals(0, lightsLit(9 * DAY))
        assertEquals(1, lightsLit(4 * DAY + HOUR))
        assertEquals(3, lightsLit(2 * DAY + 5 * HOUR))
        assertEquals(5, lightsLit(5 * MINUTE))
        assertEquals(0, lightsLit(0))
    }

    @Test
    fun cardUrlCarriesSizeThemeSessionAndZone() {
        val url = cardUrl(payload(State.UPCOMING, Session("FP1", "ซ้อม 1", 0, 0)), "medium", 338, 158, 2.75f, true, 420)!!
        assertTrue(url.startsWith("$SITE/api/widget/card?"))
        for (part in listOf("round=16", "size=medium", "w=338", "h=158", "s=2.8", "theme=dark", "tz=420", "next=FP1")) {
            assertTrue("$part in $url", url.contains(part))
        }
        assertTrue(!url.contains("live=1"))
        val live = cardUrl(payload(State.LIVE, Session("Q", "Q", 0, 0)), "small", 150, 150, 2f, false, 0)!!
        assertTrue(live.contains("live=1") && live.contains("theme=light"))
        assertTrue(!url.contains("layer="))
        val side = cardUrl(payload(State.UPCOMING, null), "large", 338, 354, 2f, false, 420, layer = "side")!!
        assertTrue(side.contains("layer=side") && !side.contains("next="))
    }

    @Test
    fun noRaceNoCard() {
        assertNull(cardUrl(null, "small", 1, 1, 1f, false, 0))
    }
}
