package com.frnd.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class EventMock(
    val id: String,
    val title: String,
    val venue: String,
    val distanceKm: Double,
    val price: Int,
    val date: String
)

@Composable
fun EventsScreen() {
    val events = remember {
        listOf(
            EventMock("evt_1", "Grand Malayalam Fusion Music Fest", "Jawaharlal Nehru Stadium, Kochi", 5.2, 499, "Nov 15, 2026"),
            EventMock("evt_2", "Kerala Tech Creators Summit", "Le Meridien Convention Hall, Kochi", 7.8, 799, "Dec 05, 2026"),
            EventMock("evt_3", "Coastal Carnival & Street Food Fest", "Marine Drive, Kochi", 2.1, 199, "Nov 22, 2026")
        )
    }

    var selectedBookingEvent by remember { mutableStateOf<EventMock?>(null) }
    var showQrDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF030712))
            .padding(16.dp)
    ) {
        // Location Filter Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF111827))
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.MyLocation, contentDescription = null, tint = Color(0xFF818CF8), modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text("Nearby Events (Kochi)", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Sorted by GPS proximity (50 km radius)", color = Color(0xFF9CA3AF), fontSize = 11.sp)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(events) { evt ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF111827))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AssistChip(
                                onClick = {},
                                label = { Text("${evt.distanceKm} km away", fontSize = 11.sp) },
                                colors = AssistChipDefaults.assistChipColors(labelColor = Color(0xFFFBBF24))
                            )
                            Text("₹${evt.price}", fontWeight = FontWeight.Bold, color = Color(0xFF34D399), fontSize = 16.sp)
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Text(evt.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(evt.venue, color = Color(0xFF9CA3AF), fontSize = 12.sp)

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("📅 ${evt.date}", color = Color(0xFF818CF8), fontSize = 12.sp)

                            Button(
                                onClick = {
                                    selectedBookingEvent = evt
                                    showQrDialog = true
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B))
                            ) {
                                Text("Book Ticket", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showQrDialog && selectedBookingEvent != null) {
        AlertDialog(
            onDismissRequest = { showQrDialog = false },
            title = { Text("Digital Ticket Confirmed!") },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(selectedBookingEvent!!.title, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(16.dp))
                    Box(
                        modifier = Modifier
                            .size(160.dp)
                            .background(Color.White, RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("🔳 QR CODE\nFRND_TKT_VALID", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Show this QR at the entrance gate", fontSize = 11.sp, color = Color.Gray)
                }
            },
            confirmButton = {
                TextButton(onClick = { showQrDialog = false }) {
                    Text("Done")
                }
            }
        )
    }
}
